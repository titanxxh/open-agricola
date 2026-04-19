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
  Resource,
} from '../game/types'
import type { FollowUpAction } from '../actions/hooks'
import {
  ActionNode,
  ActivateCardNode,
  ChoiceNode,
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
import {
  getListenerById,
  executeCardListener,
  shouldSkipImmediateListenerLog,
} from '../cards/card-listeners'
import { EngineTree } from './tree'
import { LogStore } from './log-store'

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
  private pendingChoiceNodeId: string | null = null
  private pendingChoiceActionId: string | null = null
  private pendingChoiceOwnerNodeId: string | null = null
  private pendingChoiceContext:
    | Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'>
    | null = null
  private flowNodeCounter = 0
  private beforePhaseFlowNodeIds = new Set<string>()
  private lastComputedCosts: Partial<import('../game/types').Resource> | undefined = undefined

  getLastComputedCosts() {
    return this.lastComputedCosts
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

  private findPairedChoiceNode(node: ActionNode): ChoiceNode | null {
    const parent = this.tree.findParent(node.id)
    if (!(parent instanceof SequenceNode)) return null
    const index = parent.children.findIndex((child) => child.id === node.id)
    if (index === -1) return null
    const candidate = parent.children[index + 1]
    return candidate instanceof ChoiceNode ? candidate : null
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
    const children = (node as any).children as EngineNode[] | undefined
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
    if (node instanceof ChoiceNode) {
      const clone = new ChoiceNode(
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
    if (node instanceof ActionNode || node instanceof ChoiceNode) {
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
    if (node.actionId === 'pay-resources') {
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
      firstAction?.actionId === 'pay-resources' &&
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
      if (definition?.resolveChoice) {
        const sequence = new SequenceNode(nextId(), [
          actionNode,
          new ChoiceNode(nextId(), []),
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

  private findChoiceNode(node: EngineNode): ChoiceNode | null {
    if (node instanceof ChoiceNode) return node
    if (node instanceof OptionalNode) {
      return this.findChoiceNode(node.child)
    }
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const found = this.findChoiceNode(child)
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
      return action.resolveChoice(executionContext, value)
    }
    return {
      type: 'choice',
      promptKey: action.choicePromptKey,
      options: affordable,
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
      this.pendingChoiceNodeId !== null
        ? this.tree.findNodeById(this.pendingChoiceNodeId)
        : null
    const choiceData =
      choiceNode instanceof ChoiceNode
        ? {
            id: choiceNode.id,
            promptKey: choiceNode.promptKey,
            choices: choiceNode.choices,
          }
        : null
    return {
      nodeStates,
      pendingChoiceNodeId: this.pendingChoiceNodeId,
      pendingChoiceActionId: this.pendingChoiceActionId,
      pendingChoiceOwnerNodeId: this.pendingChoiceOwnerNodeId,
      pendingChoiceContext: this.pendingChoiceContext,
      choiceData,
    }
  }

  hasPendingChoiceCompositeAncestor() {
    if (!this.pendingChoiceNodeId) return false
    let parent = this.tree.findParent(this.pendingChoiceNodeId)
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
    pendingChoiceNodeId: string | null
    pendingChoiceActionId: string | null
    pendingChoiceOwnerNodeId: string | null
    pendingChoiceContext: Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'> | null
    choiceData: {
      id: string
      promptKey?: string
      choices: ActionChoiceOption[]
    } | null
  }) {
    const nodeMap = new Map(
      this.tree.allNodes().map((node) => [node.id, node]),
    )
    snapshot.nodeStates.forEach(({ id, state }) => {
      const node = nodeMap.get(id)
      if (!node) return
      if (node instanceof ChoiceNode) {
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
      if (node instanceof ChoiceNode) {
        node.setChoice(snapshot.choiceData.promptKey, snapshot.choiceData.choices)
      }
    }
    this.pendingChoiceNodeId = snapshot.pendingChoiceNodeId
    this.pendingChoiceActionId = snapshot.pendingChoiceActionId
    this.pendingChoiceOwnerNodeId = snapshot.pendingChoiceOwnerNodeId
    this.pendingChoiceContext = snapshot.pendingChoiceContext
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
      if (options.length === 0) {
        return { type: 'blocked', nodeId: node.id }
      }
      this.pendingChoiceNodeId = node.id
      this.pendingChoiceActionId = null
      this.pendingChoiceContext = {
        params: undefined,
        costs: undefined,
        sourceCard: this.resolveChoiceSourceCard(this.getNodeSourceCard(node), options),
        actionContext: undefined,
      }
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey: node.promptKey ?? 'ui.interactionFlowSelect',
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
        ),
      )
      if (!doable) {
        node.resolve()
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      this.pendingChoiceNodeId = node.id
      this.pendingChoiceActionId = null
      this.pendingChoiceContext = {
        params: actionNode.params,
        costs: undefined,
        sourceCard: actionNode.sourceCard,
        actionContext: actionNode.actionContext,
      }
      const label = this.getChoiceLabel(node) ?? {
        labelKey: actionNode.choiceLabelKey ?? action.nameKey,
        labelParams: actionNode.choiceLabelParams,
      }
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey: node.promptKey ?? 'ui.interactionOptionalAction',
          options: [
            {
              value: actionNode.id,
              labelKey: label.labelKey,
              labelParams: label.labelParams,
              sourceCard: actionNode.sourceCard,
              effectPreview: this.getNodeEffectPreview(node.child),
            },
            { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
          ],
        },
      }
    }
    if (node instanceof ChoiceNode) {
      if (node.choices.length > 0) {
        if (!this.pendingChoiceContext) {
          this.pendingChoiceContext = {
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
      const result = executeCardListener(listener, listenerContext as any, {
        ownerPlayerId,
      })
      const normalizedFollowUps = (result?.followUpActions ?? []).map((followUp) =>
        this.normalizeFollowUpAction(followUp, result?.sourceCard),
      )
      if (result?.flow || normalizedFollowUps.length > 0) {
        const needsSwitch = ownerPlayerId && ownerPlayerId !== context.player.id
        const effectPlayer =
          (ownerPlayerId
            ? context.state.players.find((player) => player.id === ownerPlayerId)
            : null) ?? context.player
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
      if (result?.logKey && !shouldSkipImmediateListenerLog(result)) {
        const effectPlayer =
          (ownerPlayerId ? context.state.players.find((player) => player.id === ownerPlayerId) : null)
          ?? context.player
        this.log.append({
          key: result.logKey,
          params: {
            player: effectPlayer.name,
            ...result.logParams,
          },
        })
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
        action.canBeExecutedByPlayer(executionContext.state, executionContext.player),
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
if (result.type === 'choice') {
node.resolve(result)
if (!action.getBaseChoiceOptions) {
const argResults = this.hooks.computeArgs(
{ ...executionContext, actionId: replacedActionId },
result,
)
const existingValues = new Set(result.options.map((o) => o.value))
const extraOptions = argResults
.flatMap((entry) => entry.extraOptions ?? [])
.filter((option) => option && !existingValues.has(option.value))
if (extraOptions.length > 0) {
result.options = [...result.options, ...extraOptions]
          }
        }
        const choiceNode = this.findPairedChoiceNode(node) ?? this.findChoiceNode(this.tree.root)
        if (choiceNode) {
          choiceNode.setChoice(result.promptKey, result.options)
          this.pendingChoiceNodeId = choiceNode.id
          this.pendingChoiceActionId = replacedActionId
          this.pendingChoiceOwnerNodeId = null
        } else {
          this.pendingChoiceNodeId = node.id
          this.pendingChoiceActionId = replacedActionId
          this.pendingChoiceOwnerNodeId = null
        }
        this.pendingChoiceContext = {
          params: executionContext.params,
          costs: executionContext.costs,
          sourceCard: this.resolveChoiceSourceCard(executionContext.sourceCard, result.options),
          actionContext: executionContext.actionContext,
        }
        if (duringActivateNodes.length > 0) {
          this.tree.insertAfter(node.id, [...duringActivateNodes])
        }
return {
type: 'choice',
nodeId: this.pendingChoiceNodeId ?? node.id,
choice: { promptKey: result.promptKey, promptParams: result.promptParams, options: result.options },
}
      }
      this.findPairedChoiceNode(node)?.setState('resolved')
      if (result.type === 'flow') {
        const flowNode = this.buildFlowNode(result.flow)
        this.tree.insertAfter(node.id, [flowNode])
      }
      const immediatePhase = this.hooks.immediatelyAfter(
        { ...executionContext, actionId: replacedActionId },
        result,
      )
      if (result.type === 'ok' && result.logKey) {
        this.log.append({
          key: result.logKey,
          params: { player: context.player.name, ...result.logParams },
        })
      } else {
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
      const allInsertNodes = [
        ...duringActivateNodes,
        ...hookFlows,
        ...this.buildFollowUpNodes(followUps, node.id, context.player),
        ...immediateActivateNodes,
        ...afterActivateNodes,
      ]
      if (allInsertNodes.length > 0) {
        this.tree.insertAfter(node.id, allInsertNodes)
      }
      node.resolve(result)
      return { type: 'ok', nodeId: node.id, actionId: replacedActionId, result }
    }
    return { type: 'blocked', nodeId: node.id }
  }

  resolveChoice(
    choice: string,
    context: EngineContext,
    resolvedResultOverride?: ActionExecutionResult,
  ): ActionExecutionResult {
    if (this.pendingChoiceNodeId) {
      const node = this.tree.findNodeById(this.pendingChoiceNodeId)
      if (node instanceof OptionalNode) {
        if (choice === '__skip__') {
          node.resolve()
          this.pendingChoiceNodeId = null
          this.pendingChoiceActionId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
          return { type: 'ok' }
        }
        node.active = true
        this.pendingChoiceNodeId = null
        this.pendingChoiceActionId = null
        this.pendingChoiceOwnerNodeId = null
        this.pendingChoiceContext = null
        return { type: 'ok' }
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        if (choice === '__done__' && node instanceof OrNode) {
          node.resolve(choice)
          this.pendingChoiceNodeId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
          return { type: 'ok' }
        }
        const targetNode = node.children.find((item) => item.id === choice)
        const child = targetNode ? this.findActionNode(targetNode) : null
        if (!child) {
          this.pendingChoiceNodeId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
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
          this.pendingChoiceNodeId = null
          this.pendingChoiceActionId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
          return { type: 'ok' }
        }
        const action = this.registry.get(actionId)
        if (!action) {
          this.pendingChoiceNodeId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
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
          this.pendingChoiceNodeId = null
          this.pendingChoiceActionId = null
          this.pendingChoiceOwnerNodeId = null
          this.pendingChoiceContext = null
          return { type: 'ok' }
        }
        const result = action.execute(executionContext)
        this.hooks.during({ ...executionContext, actionId }, result)
        if (result.type === 'choice') {
          child.resolve(result)
          const choiceNode = targetNode ? this.findChoiceNode(targetNode) : null
          if (choiceNode) {
            choiceNode.setChoice(result.promptKey, result.options)
            this.pendingChoiceNodeId = choiceNode.id
            this.pendingChoiceActionId = actionId
            this.pendingChoiceOwnerNodeId = node instanceof XorNode ? node.id : null
          } else {
            this.pendingChoiceNodeId = child.id
            this.pendingChoiceActionId = actionId
            this.pendingChoiceOwnerNodeId = node instanceof XorNode ? node.id : null
          }
          this.pendingChoiceContext = {
            params: executionContext.params,
            costs: executionContext.costs,
            sourceCard: this.resolveChoiceSourceCard(executionContext.sourceCard, result.options),
            actionContext: executionContext.actionContext,
          }
          const argResults = this.hooks.computeArgs(
            { ...executionContext, actionId },
            result,
          )
          const existingValues = new Set(result.options.map((o) => o.value))
          const extraOptions = argResults
            .flatMap((entry) => entry.extraOptions ?? [])
            .filter((option) => option && !existingValues.has(option.value))
          if (extraOptions.length > 0) {
            result.options = [...result.options, ...extraOptions]
          }
          return result
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
        allResults.forEach((entry) => {
          if (entry.logKey) {
            this.log.append({
              key: entry.logKey,
              params: { player: context.player.name, ...entry.logParams },
            })
          }
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
        const allInsertNodes = [
          ...hookFlows,
          ...this.buildFollowUpNodes(followUps, child.id, context.player),
          ...immediateActivateNodes,
          ...afterActivateNodes,
        ]
        if (allInsertNodes.length > 0) {
          this.tree.insertAfter(node instanceof XorNode ? node.id : child.id, allInsertNodes)
        }
        child.resolve(result)
        if (node instanceof XorNode) {
          node.resolve(choice)
        }
        this.pendingChoiceNodeId = null
        this.pendingChoiceOwnerNodeId = null
        this.pendingChoiceContext = null
        return result
      }
    }
    const actionId = this.pendingChoiceActionId
    if (!actionId) {
      this.pendingChoiceContext = null
      return { type: 'ok' }
    }
    const action = this.registry.get(actionId)
    if (!action) {
      this.pendingChoiceContext = null
      return { type: 'ok' }
    }
    const executionContext = this.buildChoiceExecutionContext(context, this.pendingChoiceContext)
    executionContext.params = {
      ...(executionContext.params ?? {}),
      selectedOption: choice,
    }
    let result: ActionExecutionResult
    if (resolvedResultOverride) {
      result = resolvedResultOverride
    } else if (action.resolveChoice) {
      result = action.resolveChoice(executionContext, choice)
    } else {
      return { type: 'ok' }
    }
    this.hooks.during({ ...executionContext, actionId }, result)
    if (result.type === 'choice') {
      if (this.pendingChoiceNodeId) {
        const node = this.tree.findNodeById(this.pendingChoiceNodeId)
        if (node instanceof ChoiceNode) {
          node.setChoice(result.promptKey, result.options)
          this.pendingChoiceActionId = actionId
          this.pendingChoiceContext = {
            params: executionContext.params,
            costs: executionContext.costs,
            sourceCard: this.resolveChoiceSourceCard(executionContext.sourceCard, result.options),
            actionContext: executionContext.actionContext,
          }
          return result
        }
      }
      this.pendingChoiceNodeId = null
      this.pendingChoiceContext = {
        params: executionContext.params,
        costs: executionContext.costs,
        sourceCard: this.resolveChoiceSourceCard(executionContext.sourceCard, result.options),
        actionContext: executionContext.actionContext,
      }
      // Don't clear pendingChoiceActionId - the action still needs to resolve its choice
      return result
    }
    const insertionTargetId = this.pendingChoiceOwnerNodeId ?? this.pendingChoiceNodeId
    if (result.type === 'flow') {
      const flowNode = this.buildFlowNode(result.flow)
      if (insertionTargetId) {
        this.tree.insertAfter(insertionTargetId, [flowNode])
      }
    }
    // Use result's logKey if present, otherwise use generic action log
    if (result.type === 'ok' && result.logKey) {
      this.log.append({
        key: result.logKey,
        params: { player: context.player.name, ...result.logParams },
      })
    }
    const immediatePhase = this.hooks.immediatelyAfter({ ...executionContext, actionId, choice }, result, choice)
    const afterPhase = this.hooks.after({ ...executionContext, actionId, choice }, result, choice)
    
    const allResults = [
      ...immediatePhase.actionHookResults,
      ...afterPhase.actionHookResults,
    ]
    allResults.forEach((entry) => {
      if (entry.logKey) {
        this.log.append({
          key: entry.logKey,
          params: { player: context.player.name, ...entry.logParams },
        })
      }
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
    const allInsertNodes = [
      ...hookFlows,
      ...this.buildFollowUpNodes(followUps, insertionTargetId ?? '', context.player),
      ...immediateActivateNodes,
      ...afterActivateNodes,
    ]
    if (allInsertNodes.length > 0 && insertionTargetId) {
      this.tree.insertAfter(insertionTargetId, allInsertNodes)
    }
    if (this.pendingChoiceNodeId) {
      const node = this.tree.findNodeById(this.pendingChoiceNodeId)
      if (node instanceof ChoiceNode) {
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
    if (this.pendingChoiceOwnerNodeId) {
      const ownerNode = this.tree.findNodeById(this.pendingChoiceOwnerNodeId)
      if (ownerNode instanceof XorNode) {
        ownerNode.resolve()
      }
    }
    this.pendingChoiceNodeId = null
    this.pendingChoiceActionId = null
    this.pendingChoiceOwnerNodeId = null
    this.pendingChoiceContext = null
    return result
  }
}
