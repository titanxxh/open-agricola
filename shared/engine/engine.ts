import type {
  ActionDefinition,
  ChoiceEffectPreview,
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
  Resource,
} from '../game/types'
import type { PromptKey } from '../game/prompt-keys'
import type { FollowUpAction } from '../actions/hooks'
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
import type { EngineNode, EngineStepResult } from './types'
import { ActionRegistry } from './registry'
import { HookDispatcher } from './dispatcher'
import { getListenerById, executeCardListener, shouldSkipImmediateListenerLog } from '../cards/card-listeners'
import { incCardUsed } from '../cards/helpers/card-state'
import { EngineTree } from './tree'
import { LogStore } from './log-store'
import { INTERACTION_ONLY_ACTION_ID } from './engine-stack'
import type { ReorganizeTrigger } from '../actions/effects/reorganize'

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
  private pendingInteractionNodeId: string | null = null
  private pendingInteractionActionId: string | null = null
  private pendingInteractionOwnerNodeId: string | null = null
  private pendingInteractionContext:
    | Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'>
    | null = null
  private flowNodeCounter = 0
  private beforePhaseFlowNodeIds = new Set<string>()
  private lastComputedCosts: Partial<import('../game/types').Resource> | undefined = undefined
  /**
  /**
   * S2 Task 8: returns the pending-choice metadata regardless of whether the
   * pending node is an `InteractionNode` (leaf-paired) or one of the composite
   * nodes (`OrNode` / `XorNode` / `OptionalNode`). Replaces the engine-level
   * `lastEmittedChoice` cache — composite nodes now carry their own
   * `emittedChoices` / `emittedPromptKey` / `emittedPromptParams` /
   * `emittedRequest` fields populated in {@link proceed}.
   */
  peekPendingChoiceFromComposite(): {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null {
    if (this.pendingInteractionNodeId === null) return null
    const node = this.tree.findNodeById(this.pendingInteractionNodeId)
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

  getLastComputedCosts() {
    return this.lastComputedCosts
  }

  /**
   * Read-only accessor for the engine's pending-interaction context (sourceCard,
   * actionContext, params, costs). Used by `GameCore.buildInteraction` /
   * `GameCore.getCurrentPending` to surface fields previously stored on
   * `this.pending` (now derived from engineStack — Task 10).
   */
  getPendingInteractionContext(): Pick<
    ActionExecutionContext,
    'params' | 'costs' | 'sourceCard' | 'actionContext'
  > | null {
    return this.pendingInteractionContext
  }

  injectBeforeNodes(nodes: EngineNode[]) {
    if (nodes.length === 0) return
    const first = this.tree.nextUnresolved()
    if (first) {
      this.tree.insertBefore(first.id, nodes)
    }
  }

  peekNextUnresolved(): EngineNode | null {
    return this.tree.nextUnresolved()
  }

  peekInteraction(): InteractionNode | null {
    if (this.pendingInteractionNodeId === null) return null
    const node = this.tree.findNodeById(this.pendingInteractionNodeId)
    return node instanceof InteractionNode ? node : null
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
    this.pendingInteractionNodeId = node.id
    // Synthetic action id — never resolves through the registry. Engine paths
    // that look up `pendingInteractionActionId` (e.g. flushLeafActionDetail)
    // tolerate unknown ids gracefully.
    this.pendingInteractionActionId = INTERACTION_ONLY_ACTION_ID
    this.pendingInteractionOwnerNodeId = null
    this.pendingInteractionContext = {
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
    }
    this.lastComputedCosts = undefined
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
  private applyInteractionRequest(args: {
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
    /** When true, leave `pendingInteractionOwnerNodeId` untouched (used by
     *  the resolveChoice second-pass that wants to preserve the existing
     *  owner pointer). */
    preserveOwner?: boolean
  }): void {
    const { targetNode, fallbackNodeId, request, promptKey, promptParams, choiceOptions, actionId, ownerNodeId } = args
    if (targetNode) {
      targetNode.setChoice(promptKey, choiceOptions, promptParams)
      targetNode.request = request
      this.pendingInteractionNodeId = targetNode.id
    } else {
      this.pendingInteractionNodeId = fallbackNodeId
    }
    this.pendingInteractionActionId = actionId
    if (!args.preserveOwner) {
      this.pendingInteractionOwnerNodeId = ownerNodeId
    }
    const mergedActionContext = args.contextWritePatch
      ? { ...(args.actionContext ?? {}), ...args.contextWritePatch }
      : args.actionContext
    this.pendingInteractionContext = {
      params: args.params,
      costs: args.costs,
      sourceCard: this.resolveChoiceSourceCard(args.sourceCard, choiceOptions),
      actionContext: mergedActionContext,
    }
  }

  buildFlowNodePublic(flow: ActionFlow): EngineNode {
    return this.buildFlowNode(flow)
  }

  prependFlow(flow: ActionFlow) {
    const first = this.tree.nextUnresolved()
    const flowNode = this.buildFlowNode(flow)
    if (first) {
      this.tree.insertBefore(first.id, [flowNode])
      return
    }
    this.tree.root = new SequenceNode(`prepend-root-${this.flowNodeCounter++}`, [
      flowNode,
      this.tree.root,
    ])
  }

  private parseFollowUpAction(followUp: FollowUpAction): { actionId: string; sourceCard?: string } {
    if (typeof followUp === 'string') {
      return { actionId: followUp }
    }
    return followUp
  }

  private applyFallbackSourceCardToFlow(flow: ActionFlow, sourceCard?: string): ActionFlow {
    if (!sourceCard) return flow
    if (flow.type === 'leaf') {
      return flow.sourceCard ? flow : { ...flow, sourceCard }
    }
    if (flow.type === 'playerSwitch') return flow
    return {
      ...flow,
      children: flow.children.map((child) => this.applyFallbackSourceCardToFlow(child, sourceCard)),
    }
  }

  private normalizeFollowUpAction(
    followUp: FollowUpAction,
    sourceCard?: string,
  ): FollowUpAction {
    if (!sourceCard) return followUp
    if (typeof followUp === 'string') {
      return { actionId: followUp, sourceCard }
    }
    return followUp.sourceCard ? followUp : { ...followUp, sourceCard }
  }

  private buildFollowUpNodes(
    followUps: FollowUpAction[],
    baseId: string,
    player: PlayerState,
  ): EngineNode[] {
    return followUps
      .filter((followUp) => followUp)
      .map((followUp, index) => {
        const { actionId, sourceCard } = this.parseFollowUpAction(followUp)
        if (sourceCard) {
          this.log.append({
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
  private findActionNode(node: EngineNode): ActionNode | null {
    if (node instanceof ActionNode) return node
    if (node instanceof OptionalNode) {
      return this.findActionNode(node.child)
    }
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const found = this.findActionNode(child)
        if (found) return found
      }
    }
    return null
  }

  private findPairedInteractionNode(node: ActionNode): InteractionNode | null {
    const parent = this.tree.findParent(node.id)
    if (!(parent instanceof SequenceNode)) return null
    const index = parent.children.findIndex((child) => child.id === node.id)
    if (index === -1) return null
    const candidate = parent.children[index + 1]
    return candidate instanceof InteractionNode ? candidate : null
  }

  private buildActivateCardNodes(
    matched: { registration: { id: string; cardIds?: string[] }; cardId: string; ownerPlayerId: string }[],
    phase: string,
    actionId: string,
    event: Record<string, unknown> = {},
  ): EngineNode[] {
    return matched.map((entry, index) => {
      const nodeId = `activate-${phase}-${actionId}-${index}-${this.flowNodeCounter++}`
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

  private collectNodeIds(node: EngineNode, ids: Set<string>): void {
    ids.add(node.id)
    const children = (node as { children?: EngineNode[] }).children
    if (children) {
      for (const child of children) this.collectNodeIds(child, ids)
    }
  }

  private cloneNode(node: EngineNode): EngineNode {
    if (node instanceof ActionNode) {
      const clone = new ActionNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
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
        `${node.id}-clone-${this.flowNodeCounter++}`,
        [...node.choices],
      )
      if (node.promptKey) {
        clone.setChoice(node.promptKey, [...node.choices])
      }
      return clone
    }
    if (node instanceof SequenceNode) {
      return new SequenceNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.children.map((child) => this.cloneNode(child)),
      )
    }
    if (node instanceof ParallelNode) {
      return new ParallelNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.children.map((child) => this.cloneNode(child)),
      )
    }
    if (node instanceof OrNode) {
      return new OrNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.children.map((child) => this.cloneNode(child)),
        node.promptKey,
      )
    }
    if (node instanceof XorNode) {
      return new XorNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.children.map((child) => this.cloneNode(child)),
        node.promptKey,
      )
    }
    if (node instanceof OptionalNode) {
      const clone = new OptionalNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        this.cloneNode(node.child),
        node.promptKey,
      )
      clone.active = node.active
      return clone
    }
    if (node instanceof ActivateCardNode) {
      return new ActivateCardNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.listenerId,
        node.cardId,
        node.phase,
        node.actionId,
        node.event,
      )
    }
    if (node instanceof PlayerSwitchNode) {
      return new PlayerSwitchNode(
        `${node.id}-clone-${this.flowNodeCounter++}`,
        node.targetPlayerId,
      )
    }
    return node
  }

  private resolveSubtree(node: EngineNode): void {
    if (node instanceof OptionalNode) {
      this.resolveSubtree(node.child)
      node.resolve()
      return
    }
    if (
      node instanceof SequenceNode ||
      node instanceof ParallelNode ||
      node instanceof OrNode ||
      node instanceof XorNode
    ) {
      node.children.forEach((child) => this.resolveSubtree(child))
      node.resolve()
      return
    }
    if (node instanceof ActionNode || node instanceof InteractionNode) {
      node.setState('resolved')
      return
    }
    node.resolve()
  }

  private attachChoiceLabel(
    node: EngineNode,
    choiceLabelKey?: string,
    choiceLabelParams?: Record<string, unknown>,
  ) {
    if (!choiceLabelKey) return node
    const labeledNode = node as EngineNode & {
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
    }
    labeledNode.choiceLabelKey = choiceLabelKey
    labeledNode.choiceLabelParams = choiceLabelParams
    return node
  }

  private getChoiceLabel(
    node: EngineNode,
  ): { labelKey: string; labelParams?: Record<string, unknown> } | null {
    const labeledNode = node as EngineNode & {
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
    }
    if (labeledNode.choiceLabelKey) {
      return {
        labelKey: labeledNode.choiceLabelKey,
        labelParams: labeledNode.choiceLabelParams,
      }
    }
    if (node instanceof OptionalNode) {
      return this.getChoiceLabel(node.child)
    }
    if (node instanceof ActionNode) {
      const action = this.registry.get(node.actionId)
      if (!action) return null
      return {
        labelKey: node.choiceLabelKey ?? action.nameKey,
        labelParams: node.choiceLabelParams,
      }
    }
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const label = this.getChoiceLabel(child)
        if (label) return label
      }
    }
    return null
  }

  private getNodeSourceCard(node: EngineNode): string | undefined {
    const sourceCards = new Set<string>()
    const visit = (entry: EngineNode) => {
      if (entry instanceof ActionNode) {
        if (entry.sourceCard) sourceCards.add(entry.sourceCard)
        return
      }
      if (entry instanceof OptionalNode) {
        visit(entry.child)
        return
      }
      if (
        entry instanceof SequenceNode ||
        entry instanceof ParallelNode ||
        entry instanceof OrNode ||
        entry instanceof XorNode
      ) {
        entry.children.forEach(visit)
      }
    }
    visit(node)
    return sourceCards.size === 1 ? [...sourceCards][0] : undefined
  }

  private getOptionsSourceCard(options: ActionChoiceOption[]): string | undefined {
    if (options.length === 0) return undefined
    const normalized = options.map((option) =>
      typeof option.sourceCard === 'string' && option.sourceCard.length > 0
        ? option.sourceCard
        : null,
    )
    if (normalized.some((sourceCard) => sourceCard === null)) return undefined
    const sourceCards = [...new Set(normalized)] as string[]
    return sourceCards.length === 1 ? sourceCards[0] : undefined
  }

  private resolveChoiceSourceCard(
    sourceCard: string | undefined,
    options: ActionChoiceOption[],
  ): string | undefined {
    return sourceCard ?? this.getOptionsSourceCard(options)
  }

  private sanitizePreviewResources(
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

  private mergePreviewResources(
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

  private getActionEffectPreview(node: ActionNode): ChoiceEffectPreview | undefined {
    if (node.effectPreview) return node.effectPreview
    const params = this.sanitizePreviewResources(node.params)
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

  private collectOrderedActionNodes(node: EngineNode): ActionNode[] | null {
    if (node instanceof ActionNode) return [node]
    if (node instanceof InteractionNode) return []
    if (node instanceof OptionalNode) {
      return this.collectOrderedActionNodes(node.child)
    }
    if (node instanceof SequenceNode) {
      const flattened: ActionNode[] = []
      for (const child of node.children) {
        const childActions = this.collectOrderedActionNodes(child)
        if (!childActions) return null
        flattened.push(...childActions)
      }
      return flattened
    }
    return null
  }

  private getSequenceEffectPreview(node: SequenceNode): ChoiceEffectPreview | undefined {
    const actionNodes = this.collectOrderedActionNodes(node)
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
          resourcesGained = this.mergePreviewResources(resourcesGained, actionNode.params)
        } else if (actionNode.actionId === 'bonus-vp') {
          bonusVp += 1
        }
      })
      return {
        kind: 'resourceExchange',
        resourcesPaid: this.sanitizePreviewResources(firstAction.params),
        resourcesGained: this.sanitizePreviewResources(resourcesGained),
        bonusVp: bonusVp > 0 ? bonusVp : undefined,
      }
    }
    return undefined
  }

  private getNodeEffectPreview(node: EngineNode): ChoiceEffectPreview | undefined {
    if (node instanceof ActionNode) {
      return this.getActionEffectPreview(node)
    }
    if (node instanceof OptionalNode) {
      return this.getNodeEffectPreview(node.child)
    }
    if (node instanceof SequenceNode) {
      const aggregated = this.getSequenceEffectPreview(node)
      if (aggregated) return aggregated
      for (const child of node.children) {
        const preview = this.getNodeEffectPreview(child)
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
        const preview = this.getNodeEffectPreview(child)
        if (preview) return preview
      }
    }
    return undefined
  }

  private getFlowSourceCard(flow: ActionFlow): string | undefined {
    if (flow.type === 'leaf') return flow.sourceCard
    if (flow.type === 'playerSwitch') return undefined
    const sourceCards = [...new Set(
      flow.children
        .map((child) => this.getFlowSourceCard(child))
        .filter((sourceCard): sourceCard is string => typeof sourceCard === 'string' && sourceCard.length > 0),
    )]
    return sourceCards.length === 1 ? sourceCards[0] : undefined
  }

  private markCheckedReplaceAction(actionContext?: Record<string, unknown>) {
    return {
      ...(actionContext ?? {}),
      checkedReplaceAction: true,
    }
  }

  private buildReplaceChoiceFlow(
    actionNode: Pick<ActionNode, 'actionId' | 'params' | 'sourceCard' | 'actionContext' | 'choiceLabelKey' | 'choiceLabelParams'>,
    alternativeFlow: ActionFlow,
    replacedActionId: string,
  ): ActionFlow {
    return {
      type: 'xor',
      children: [
        alternativeFlow,
        {
          type: 'leaf',
          actionId: replacedActionId,
          params: actionNode.params,
          sourceCard: actionNode.sourceCard,
          actionContext: this.markCheckedReplaceAction(actionNode.actionContext),
          choiceLabelKey: actionNode.choiceLabelKey,
          choiceLabelParams: actionNode.choiceLabelParams,
        },
      ],
    }
  }

  private getReplaceAwareChoiceLabel(
    actionNode: ActionNode,
    executionContext: ActionExecutionContext,
    defaultLabel: { labelKey: string; labelParams?: Record<string, unknown> },
  ) {
    const replaceResult = this.hooks.applyComputeReplace({
      ...executionContext,
      actionId: actionNode.actionId,
    })
    const replaceSourceCard = replaceResult.sourceCard ?? actionNode.sourceCard
    if (actionNode.choiceLabelKey) return { ...defaultLabel, sourceCard: replaceSourceCard }
    if (!replaceResult.declined || !replaceResult.alternativeFlow) {
      return { ...defaultLabel, sourceCard: replaceSourceCard }
    }
    const alternativeFlow = this.applyFallbackSourceCardToFlow(
      replaceResult.alternativeFlow,
      replaceResult.sourceCard,
    )
    return {
      labelKey: 'ui.interactionActionOrReplace',
      labelParams: { actionNameKey: defaultLabel.labelKey },
      sourceCard: this.getFlowSourceCard(alternativeFlow),
    }
  }

  private buildFlowNode(flow: ActionFlow): EngineNode {
    const nextId = () => `flow-${this.flowNodeCounter++}`
    if (flow.type === 'playerSwitch') {
      return new PlayerSwitchNode(`ps-flow-${this.flowNodeCounter++}`, flow.targetPlayerId)
    }
    if (flow.type === 'leaf') {
      if (flow.expandFlow) {
        const definition = this.registry.get(flow.actionId)
        if (definition?.flow) {
          const inner = this.mergeContextIntoFlow(
            definition.flow,
            flow.actionContext,
            flow.sourceCard,
          )
          return this.buildFlowNode(inner)
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
      const definition = this.registry.get(flow.actionId)
      if (definition?.resolveChoice && !definition.skipChoiceWrap) {
        const sequence = new SequenceNode(nextId(), [
          actionNode,
          new InteractionNode(nextId(), []),
        ])
        const node = flow.optional
          ? new OptionalNode(nextId(), sequence, flow.promptKey)
          : sequence
        return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
      }
      const node = flow.optional
        ? new OptionalNode(nextId(), actionNode, flow.promptKey)
        : actionNode
      return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    const children = flow.children.map((child) => this.buildFlowNode(child))
    if (flow.type === 'seq') {
      const sequence = new SequenceNode(nextId(), children)
      const node = flow.optional
        ? new OptionalNode(nextId(), sequence, flow.promptKey)
        : sequence
      return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    if (flow.type === 'parallel') {
      const parallel = new ParallelNode(nextId(), children)
      const node = flow.optional
        ? new OptionalNode(nextId(), parallel, flow.promptKey)
        : parallel
      return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    if (flow.type === 'xor') {
      const xor = new XorNode(nextId(), children, flow.promptKey)
      const node = flow.optional ? new OptionalNode(nextId(), xor, flow.promptKey) : xor
      return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    const or = new OrNode(nextId(), children, flow.promptKey)
    const node = flow.optional ? new OptionalNode(nextId(), or, flow.promptKey) : or
    return this.attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
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
  private mergeContextIntoFlow(
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
        this.mergeContextIntoFlow(c, outerContext, outerSourceCard),
      ),
    }
  }

  private findInteractionNode(node: EngineNode): InteractionNode | null {
    if (node instanceof InteractionNode) return node
    if (node instanceof OptionalNode) {
      return this.findInteractionNode(node.child)
    }
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const found = this.findInteractionNode(child)
        if (found) return found
      }
    }
    return null
  }

  private resolveTrueAction(actionContext?: Record<string, unknown>) {
    return actionContext?.trueAction !== false
  }

  private buildListenerEvent(
    executionContext: Pick<ActionExecutionContext, 'sourceCard' | 'actionContext'>,
    extraEvent: Record<string, unknown> = {},
  ) {
    return {
      ...extraEvent,
      sourceCard: executionContext.sourceCard,
      ...(executionContext.actionContext ?? {}),
      trueAction: this.resolveTrueAction(executionContext.actionContext),
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
  private maybeBuildChoiceCandidates(
    executionContext: ActionExecutionContext,
    action: ActionDefinition,
    actionId: string,
  ): ActionExecutionResult | null {
    if (!action.getBaseChoiceOptions) return null
    const baseOpts = action.getBaseChoiceOptions(executionContext) ?? []
    const candidateResults = this.hooks.computeChoiceCandidates({
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
      return this.hooks.isOptionAffordable(probeCtx, action)
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

  private buildChoiceExecutionContext(
    context: EngineContext,
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

  snapshot() {
    const nodes = this.tree.allNodes()
    const nodeStates = nodes.map((node) => ({
      id: node.id,
      state: node.getState(),
      active: node instanceof OptionalNode ? node.active : undefined,
    }))
    const choiceNode =
      this.pendingInteractionNodeId !== null
        ? this.tree.findNodeById(this.pendingInteractionNodeId)
        : null
    const choiceData =
      choiceNode instanceof InteractionNode
        ? {
            id: choiceNode.id,
            promptKey: choiceNode.promptKey,
            choices: choiceNode.choices,
            request: choiceNode.request,
          }
        : null
    return {
      nodeStates,
      pendingInteractionNodeId: this.pendingInteractionNodeId,
      pendingInteractionActionId: this.pendingInteractionActionId,
      pendingInteractionOwnerNodeId: this.pendingInteractionOwnerNodeId,
      pendingInteractionContext: this.pendingInteractionContext,
      choiceData,
      // S2 Task 8: composite (Or/Xor/Optional) emit metadata is now stored
      // on the node itself instead of an engine-level cache. We still need
      // to persist it so cursor round-trip / undo restoreHistory can rebuild
      // the pending-choice host on rehydrate.
      compositeEmit: this.snapshotCompositeEmit(),
    }
  }

  private snapshotCompositeEmit(): {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null {
    if (this.pendingInteractionNodeId === null) return null
    const node = this.tree.findNodeById(this.pendingInteractionNodeId)
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

  hasPendingChoiceCompositeAncestor() {
    if (!this.pendingInteractionNodeId) return false
    let parent = this.tree.findParent(this.pendingInteractionNodeId)
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
    pendingInteractionNodeId: string | null
    pendingInteractionActionId: string | null
    pendingInteractionOwnerNodeId: string | null
    pendingInteractionContext: Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'> | null
    choiceData: {
      id: string
      promptKey?: PromptKey
      choices: ActionChoiceOption[]
      request?: InteractionRequest
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
    // serializes them with `pendingInteractionActionId === '__interaction_only__'`
    // and the InteractionNode's request in `choiceData`. Re-inject before the
    // normal nodeStates pass so subsequent `nextUnresolved()` finds the same
    // InteractionNode the original session held.
    if (
      snapshot.pendingInteractionActionId === INTERACTION_ONLY_ACTION_ID &&
      snapshot.choiceData
    ) {
      const restored = new InteractionNode(
        snapshot.choiceData.id,
        snapshot.choiceData.choices,
        snapshot.choiceData.request,
      )
      restored.promptKey = snapshot.choiceData.promptKey
      this.injectInteraction(restored)
      this.pendingInteractionContext = snapshot.pendingInteractionContext
      // Replay the node state in case the interaction was already
      // partially resolved before serialization.
      const nodeStateEntry = snapshot.nodeStates.find(
        (entry) => entry.id === snapshot.choiceData!.id,
      )
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
      }
    }
    this.pendingInteractionNodeId = snapshot.pendingInteractionNodeId
    this.pendingInteractionActionId = snapshot.pendingInteractionActionId
    this.pendingInteractionOwnerNodeId = snapshot.pendingInteractionOwnerNodeId
    this.pendingInteractionContext = snapshot.pendingInteractionContext

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
          actionNode: this.findActionNode(child),
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
          const baseLabel = this.getChoiceLabel(entry.node)
          if (!baseLabel) return null
          const label = this.getReplaceAwareChoiceLabel(entry.actionNode, executionContext, baseLabel)
          return {
            value: entry.nodeId,
            labelKey: label.labelKey,
            labelParams: label.labelParams,
            sourceCard: label.sourceCard ?? this.getNodeSourceCard(entry.node),
            effectPreview: this.getNodeEffectPreview(entry.node),
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
      this.pendingInteractionNodeId = node.id
      this.pendingInteractionActionId = null
      this.pendingInteractionContext = {
        params: undefined,
        costs: undefined,
        sourceCard: this.resolveChoiceSourceCard(this.getNodeSourceCard(node), options),
        actionContext: undefined,
      }
      const compositePromptKey = node.promptKey ?? 'ui.interactionFlowSelect'
      // S2 Task 8: write emit metadata to the OrNode/XorNode itself instead
      // of the engine-level lastEmittedChoice cache.
      node.emittedChoices = options
      node.emittedPromptKey = compositePromptKey
      node.emittedPromptParams = undefined
      node.emittedRequest = undefined
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
      const actionNode = this.findActionNode(node.child)
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
      this.pendingInteractionNodeId = node.id
      this.pendingInteractionActionId = null
      this.pendingInteractionContext = {
        params: actionNode.params,
        costs: undefined,
        sourceCard: actionNode.sourceCard,
        actionContext: actionNode.actionContext,
      }
      const label = this.getChoiceLabel(node) ?? {
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
          effectPreview: this.getNodeEffectPreview(node.child),
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
      if (node.choices.length > 0) {
        if (!this.pendingInteractionContext) {
          this.pendingInteractionContext = {
            params: undefined,
            costs: undefined,
            sourceCard: this.getOptionsSourceCard(node.choices),
            actionContext: undefined,
          }
        }
        return {
          type: 'choice',
          nodeId: node.id,
          choice: { promptKey: node.promptKey, options: node.choices },
        }
      }
      return { type: 'blocked', nodeId: node.id }
    }
    if (node instanceof PlayerSwitchNode) {
      node.resolve({})
      return { type: 'playerSwitch', nodeId: node.id, targetPlayerId: node.targetPlayerId }
    }
    if (node instanceof ActivateCardNode) {
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
        this.normalizeFollowUpAction(followUp, result?.sourceCard),
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
          const flowNode = this.buildFlowNode(
            this.applyFallbackSourceCardToFlow(result.flow, result.sourceCard),
          )
          if (node.phase === 'before') {
            this.collectNodeIds(flowNode, this.beforePhaseFlowNodeIds)
          }
          insertedNodes.push(flowNode)
        }
        insertedNodes.push(...this.buildFollowUpNodes(normalizedFollowUps, node.id, effectPlayer))
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
    if (node instanceof ActionNode) {
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
        const flowNode = this.buildFlowNode(
          this.buildReplaceChoiceFlow(
            node,
            this.applyFallbackSourceCardToFlow(
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
      this.lastComputedCosts = executionContext.costs
      if (!this.beforePhaseFlowNodeIds.has(node.id)) {
        const beforePhase = this.hooks.before({ ...executionContext, actionId: replacedActionId })
        const beforeActivateNodes = this.buildActivateCardNodes(
          beforePhase.matchedListeners, 'before', replacedActionId,
        )
        if (beforeActivateNodes.length > 0 && !node.beforePhaseResolved) {
          node.beforePhaseResolved = true
          this.tree.insertBefore(node.id, beforeActivateNodes)
          return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
        }
      }
      const optInChoice = this.maybeBuildChoiceCandidates(
        executionContext,
        action,
        replacedActionId,
      )
      const result = optInChoice ?? action.execute(executionContext)
      const duringPhase = this.hooks.during({ ...executionContext, actionId: replacedActionId }, result)
      const duringActivateNodes = this.buildActivateCardNodes(
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
        const choiceNode = this.findPairedInteractionNode(node) ?? this.findInteractionNode(this.tree.root)
        this.applyInteractionRequest({
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
          nodeId: this.pendingInteractionNodeId ?? node.id,
          choice: {
            promptKey: result.promptKey,
            promptParams: result.promptParams,
            options: choiceOptions,
          },
        }
      }
      this.findPairedInteractionNode(node)?.setState('resolved')
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
          ? this.applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
          : null)
        .filter((flow) => flow)
        .map((flow) => this.buildFlowNode(flow as ActionFlow))
      const followUps = allActionHookResults
        .flatMap((entry) =>
          (entry.followUpActions ?? []).map((followUp) =>
            this.normalizeFollowUpAction(followUp, entry.sourceCard),
          ),
        )
        .filter((action) => action)
      const immediateActivateNodes = this.buildActivateCardNodes(
        immediatePhase.matchedListeners, 'immediatelyAfter', replacedActionId,
        this.buildListenerEvent(executionContext, { result }),
      )
      const afterActivateNodes = this.buildActivateCardNodes(
        afterPhase.matchedListeners, 'after', replacedActionId,
        this.buildListenerEvent(executionContext, { result }),
      )
      // 7b1: when the action returns a `flow`, the wrapper action's `after`
      // / `immediatelyAfter` listeners (and follow-ups) must observe the
      // post-flow state — for renovate-house → seq:[pay, apply-renovation],
      // listeners that read `player.houseType` would otherwise see the
      // pre-mutate snapshot. We therefore insert flow body FIRST (last call
      // wins via insertAfter), and trailing hooks AFTER the flow.
      const trailingHookNodes = [
        ...this.buildFollowUpNodes(followUps, node.id, context.player),
        ...immediateActivateNodes,
        ...afterActivateNodes,
      ]
      const leadingNodes = [
        ...duringActivateNodes,
        ...hookFlows,
      ]
      if (result.type === 'flow') {
        const flowNode = this.buildFlowNode(result.flow)
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
    if (this.pendingInteractionNodeId) {
      const node = this.tree.findNodeById(this.pendingInteractionNodeId)
      if (node instanceof OptionalNode) {
        if (choice === '__skip__') {
          node.resolve()
          this.pendingInteractionNodeId = null
          this.pendingInteractionActionId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
          return { type: 'ok' }
        }
        node.active = true
        this.pendingInteractionNodeId = null
        this.pendingInteractionActionId = null
        this.pendingInteractionOwnerNodeId = null
        this.pendingInteractionContext = null
        return { type: 'ok' }
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        if (choice === '__done__' && node instanceof OrNode) {
          node.resolve(choice)
          this.pendingInteractionNodeId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
          return { type: 'ok' }
        }
        if (choice === '__skip__') {
          const parent = this.tree.findParent(node.id)
          if (parent instanceof OptionalNode) {
            this.resolveSubtree(node)
            parent.resolve()
            this.pendingInteractionNodeId = null
            this.pendingInteractionActionId = null
            this.pendingInteractionOwnerNodeId = null
            this.pendingInteractionContext = null
            return { type: 'ok' }
          }
        }
        const targetNode = node.children.find((item) => item.id === choice)
        const child = targetNode ? this.findActionNode(targetNode) : null
        if (!child) {
          this.pendingInteractionNodeId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
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
          const flowNode = this.buildFlowNode(
            this.buildReplaceChoiceFlow(
              child,
              this.applyFallbackSourceCardToFlow(
                replaceResult.alternativeFlow,
                replaceResult.sourceCard,
              ),
              actionId,
            ),
          )
          this.tree.insertAfter(node.id, [flowNode])
          targetNode!.resolve(choice)
          node.resolve(choice)
          this.pendingInteractionNodeId = null
          this.pendingInteractionActionId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
          return { type: 'ok' }
        }
        const action = this.registry.get(actionId)
        if (!action) {
          this.pendingInteractionNodeId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
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
        const beforeActivateNodes = this.buildActivateCardNodes(
          beforePhase.matchedListeners, 'before', actionId,
        )
        if (beforeActivateNodes.length > 0 && !child.beforePhaseResolved) {
          child.beforePhaseResolved = true
          const deferredTarget = this.cloneNode(targetNode!)
          const deferredAction = this.findActionNode(deferredTarget)
          if (deferredAction) {
            deferredAction.beforePhaseResolved = true
          }
          this.resolveSubtree(targetNode!)
          if (node instanceof XorNode) {
            node.resolve(choice)
          }
          this.tree.insertBefore(node.id, [...beforeActivateNodes, deferredTarget])
          this.pendingInteractionNodeId = null
          this.pendingInteractionActionId = null
          this.pendingInteractionOwnerNodeId = null
          this.pendingInteractionContext = null
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
          const choiceNode = targetNode ? this.findInteractionNode(targetNode) : null
          this.applyInteractionRequest({
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
            ? this.applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
            : null)
          .filter((flow) => flow)
          .map((flow) => this.buildFlowNode(flow as ActionFlow))
        const followUps = allResults
          .flatMap((entry) =>
            (entry.followUpActions ?? []).map((followUp) =>
              this.normalizeFollowUpAction(followUp, entry.sourceCard),
            ),
          )
          .filter((action) => action)
        const immediateActivateNodes = this.buildActivateCardNodes(
          immediatePhase.matchedListeners, 'immediatelyAfter', actionId,
          this.buildListenerEvent(executionContext, { result, choice }),
        )
        const afterActivateNodes = this.buildActivateCardNodes(
          afterPhase.matchedListeners, 'after', actionId,
          this.buildListenerEvent(executionContext, { result, choice }),
        )
        // 7b1: insert flow body BEFORE trailing hook nodes so wrapper-style
        // actions (renovate-house, occupation, improvement-any) emit their
        // `after` listeners on the post-mutate state. See top-level path
        // (resolveActionStep) for the same ordering rationale.
        const insertAnchor = node instanceof XorNode ? node.id : child.id
        const trailingHookNodes = [
          ...this.buildFollowUpNodes(followUps, child.id, context.player),
          ...immediateActivateNodes,
          ...afterActivateNodes,
        ]
        if (result.type === 'flow') {
          const flowNode = this.buildFlowNode(result.flow)
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
        this.pendingInteractionNodeId = null
        this.pendingInteractionOwnerNodeId = null
        this.pendingInteractionContext = null
        return result
      }
    }
    const actionId = this.pendingInteractionActionId
    if (!actionId) {
      this.pendingInteractionContext = null
      return { type: 'ok' }
    }
    const action = this.registry.get(actionId)
    if (!action) {
      this.pendingInteractionContext = null
      return { type: 'ok' }
    }
    const executionContext = this.buildChoiceExecutionContext(context, this.pendingInteractionContext)
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
      // Merge ActionDef-declared actionContext patches into pendingInteractionContext.actionContext.
      // Used by farm ActionDefs to persist payload (e.g. fence geometry) across payment-combo
      // second prompts. The shallow merge itself happens inside
      // `applyInteractionRequest` so all three sites share one implementation.
      const contextWritePatch =
        result.extraData && typeof result.extraData === 'object'
          ? (result.extraData.actionContextWrite as Record<string, unknown> | undefined)
          : undefined
      const requestOptions = result.request.options
      const existingNode = this.pendingInteractionNodeId
        ? this.tree.findNodeById(this.pendingInteractionNodeId)
        : null
      const interactionTarget = existingNode instanceof InteractionNode ? existingNode : null
      this.applyInteractionRequest({
        targetNode: interactionTarget,
        fallbackNodeId: null,
        request: result.request,
        promptKey: result.promptKey,
        promptParams: result.promptParams,
        choiceOptions: requestOptions,
        actionId,
        // resolveChoice second-pass keeps the existing owner pointer (e.g.
        // XorNode owner when the second prompt is still nested under the
        // same parent). Don't clobber it.
        ownerNodeId: this.pendingInteractionOwnerNodeId,
        preserveOwner: true,
        params: executionContext.params,
        costs: executionContext.costs,
        sourceCard: executionContext.sourceCard,
        actionContext: executionContext.actionContext,
        contextWritePatch,
      })
      // Don't clear pendingInteractionActionId — the action still needs to resolve its choice.
      return result
    }
    if (result.type === 'ok' || result.type === 'flow') {
      collectImmediateLogs(context.player.name, result).forEach((entry) => {
        this.log.append(entry)
      })
    }
    const insertionTargetId = this.pendingInteractionOwnerNodeId ?? this.pendingInteractionNodeId
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
        ? this.applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
        : null)
      .filter((flow) => flow)
      .map((flow) => this.buildFlowNode(flow as ActionFlow))
    const followUps = allResults
      .flatMap((entry) =>
        (entry.followUpActions ?? []).map((followUp) =>
          this.normalizeFollowUpAction(followUp, entry.sourceCard),
        ),
      )
      .filter((action) => action)
    const immediateActivateNodes = this.buildActivateCardNodes(
      immediatePhase.matchedListeners, 'immediatelyAfter', actionId,
      this.buildListenerEvent(executionContext, { result, choice }),
    )
    const afterActivateNodes = this.buildActivateCardNodes(
      afterPhase.matchedListeners, 'after', actionId,
      this.buildListenerEvent(executionContext, { result, choice }),
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
        ...this.buildFollowUpNodes(followUps, insertionTargetId, context.player),
        ...immediateActivateNodes,
        ...afterActivateNodes,
      ]
      if (result.type === 'flow') {
        const flowNode = this.buildFlowNode(result.flow)
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
    if (this.pendingInteractionNodeId) {
      const node = this.tree.findNodeById(this.pendingInteractionNodeId)
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
    if (this.pendingInteractionOwnerNodeId) {
      const ownerNode = this.tree.findNodeById(this.pendingInteractionOwnerNodeId)
      if (ownerNode instanceof XorNode) {
        ownerNode.resolve()
      }
    }
    this.pendingInteractionNodeId = null
    this.pendingInteractionActionId = null
    this.pendingInteractionOwnerNodeId = null
    this.pendingInteractionContext = null
    return result
  }

  /** Insert an ActionFlow to run after the pending choice is resolved. Precondition: a
   *  pending choice is currently active (pendingInteractionNodeId is set). No-op otherwise.
   *  Mirrors the `{ type: 'flow' }` branch of resolveChoice. */
  insertFlowAfterPendingChoice(flow: ActionFlow): void {
    const insertionTargetId = this.pendingInteractionOwnerNodeId ?? this.pendingInteractionNodeId
    if (!insertionTargetId) return
    const flowNode = this.buildFlowNode(flow)
    this.tree.insertAfter(insertionTargetId, [flowNode])
  }
}
