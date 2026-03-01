import type {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  PlayerState,
  GameState,
  ActionChoiceOption,
} from '../game/types'
import {
  ActionNode,
  ChoiceNode,
  OptionalNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from './nodes'
import type { EngineNode, EngineStepResult } from './types'
import { ActionRegistry } from './registry'
import { HookDispatcher } from './dispatcher'
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
  private flowNodeCounter = 0

  private findActionNode(node: EngineNode): ActionNode | null {
    if (node instanceof ActionNode) return node
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const found = this.findActionNode(child)
        if (found) return found
      }
    }
    return null
  }

  private buildFlowNode(flow: ActionFlow): EngineNode {
    const nextId = () => `flow-${this.flowNodeCounter++}`
    if (flow.type === 'leaf') {
      const actionNode = new ActionNode(nextId(), flow.actionId)
      const definition = this.registry.get(flow.actionId)
      if (definition?.resolveChoice) {
        const sequence = new SequenceNode(nextId(), [
          actionNode,
          new ChoiceNode(nextId(), []),
        ])
        return flow.optional
          ? new OptionalNode(nextId(), sequence, flow.promptKey)
          : sequence
      }
      return flow.optional
        ? new OptionalNode(nextId(), actionNode, flow.promptKey)
        : actionNode
    }
    const children = flow.children.map((child) => this.buildFlowNode(child))
    if (flow.type === 'seq') {
      const sequence = new SequenceNode(nextId(), children)
      return flow.optional
        ? new OptionalNode(nextId(), sequence, flow.promptKey)
        : sequence
    }
    if (flow.type === 'parallel') {
      const parallel = new ParallelNode(nextId(), children)
      return flow.optional
        ? new OptionalNode(nextId(), parallel, flow.promptKey)
        : parallel
    }
    if (flow.type === 'xor') {
      const xor = new XorNode(nextId(), children, flow.promptKey)
      return flow.optional ? new OptionalNode(nextId(), xor, flow.promptKey) : xor
    }
    const or = new OrNode(nextId(), children, flow.promptKey)
    return flow.optional ? new OptionalNode(nextId(), or, flow.promptKey) : or
  }

  private findChoiceNode(node: EngineNode): ChoiceNode | null {
    if (node instanceof ChoiceNode) return node
    if ('children' in node) {
      const composite = node as { children: EngineNode[] }
      for (const child of composite.children) {
        const found = this.findChoiceNode(child)
        if (found) return found
      }
    }
    return null
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
      choiceData,
    }
  }

  restore(snapshot: {
    nodeStates: {
      id: string
      state: 'ready' | 'resolved' | 'blocked'
      active?: boolean
    }[]
    pendingChoiceNodeId: string | null
    pendingChoiceActionId: string | null
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
          actionNode: this.findActionNode(child),
        }))
        .filter((entry) => entry.actionNode !== null) as {
        nodeId: string
        actionNode: ActionNode
      }[]
      const options = availableActions
        .map((entry) => {
          const action = this.registry.get(entry.actionNode.actionId)
          if (!action) return null
          const executionContext: ActionExecutionContext = {
            state: context.state,
            player: context.player,
            space: context.space,
          }
          const doable = this.hooks.applyIsDoable(
            { ...executionContext, actionId: entry.actionNode.actionId },
            action.canBeExecutedByPlayer(
              executionContext.state,
              executionContext.player,
            ),
          )
          if (!doable) return null
          return {
            value: entry.nodeId,
            labelKey: action.nameKey,
          }
        })
        .filter((option) => option !== null) as {
        value: string
        labelKey: string
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
        return { type: 'blocked', nodeId: node.id }
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
      }
      const doable = this.hooks.applyIsDoable(
        { ...executionContext, actionId: actionNode.actionId },
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
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey: node.promptKey ?? 'ui.interactionOptionalAction',
          options: [
            { value: actionNode.id, labelKey: action.nameKey },
            { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
          ],
        },
      }
    }
    if (node instanceof ChoiceNode) {
      if (node.choices.length > 0) {
        return {
          type: 'choice',
          nodeId: node.id,
          choice: { promptKey: node.promptKey, options: node.choices },
        }
      }
      return { type: 'blocked', nodeId: node.id }
    }
    if (node instanceof ActionNode) {
      const replacedActionId = this.hooks.applyComputeReplace({
        ...context,
        actionId: node.actionId,
      })
      const action = this.registry.get(replacedActionId)
      if (!action) {
        return { type: 'blocked', nodeId: node.id }
      }
      const executionContext: ActionExecutionContext = {
        state: context.state,
        player: context.player,
        space: context.space,
      }
      const doable = this.hooks.applyIsDoable(
        { ...executionContext, actionId: replacedActionId },
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
      const beforeResults = this.hooks.before({ ...executionContext, actionId: replacedActionId })
      // Process before hook costs: negative values mean gain resources
      beforeResults.forEach((entry) => {
        if (!entry.costs) return
        Object.entries(entry.costs).forEach(([key, value]) => {
          if (typeof value !== 'number') return
          const resourceKey = key as keyof PlayerState['resources']
          if (value < 0) {
            // Negative cost = gain resource
            context.player.resources[resourceKey] += Math.abs(value)
          }
        })
      })
      const result = action.execute(executionContext)
      this.hooks.during({ ...executionContext, actionId: replacedActionId }, result)
      if (result.type === 'choice') {
        node.resolve(result)
        const nextNode = this.tree.nextUnresolved()
        if (nextNode instanceof ChoiceNode) {
          nextNode.setChoice(result.promptKey, result.options)
          this.pendingChoiceNodeId = nextNode.id
          this.pendingChoiceActionId = replacedActionId
        }
        const argResults = this.hooks.computeArgs(
          { ...executionContext, actionId: replacedActionId },
          result,
        )
        const extraOptions = argResults
          .flatMap((entry) => entry.extraOptions ?? [])
          .filter((option) => option)
        if (extraOptions.length > 0) {
          result.options = [...result.options, ...extraOptions]
        }
        return {
          type: 'choice',
          nodeId: this.pendingChoiceNodeId ?? node.id,
          choice: { promptKey: result.promptKey, options: result.options },
        }
      }
      if (result.type === 'flow') {
        const flowNode = this.buildFlowNode(result.flow)
        this.tree.insertAfter(node.id, [flowNode])
      }
      const immediateResults = this.hooks.immediatelyAfter(
        { ...executionContext, actionId: replacedActionId },
        result,
      )
      this.log.append({
        key: 'log.action',
        params: { actionId: replacedActionId },
      })
      const afterResults = this.hooks.after(
        { ...executionContext, actionId: replacedActionId },
        result,
      )
      const hookFlows = [...immediateResults, ...afterResults]
        .map((entry) => entry.flow)
        .filter((flow) => flow)
        .map((flow) => this.buildFlowNode(flow as ActionFlow))
      const followUps = [...immediateResults, ...afterResults]
        .flatMap((entry) => entry.followUpActions ?? [])
        .filter((actionId) => actionId)
      if (hookFlows.length > 0 || followUps.length > 0) {
        const nodes = [
          ...hookFlows,
          ...followUps.map(
            (actionId, index) => new ActionNode(`chain-${node.id}-${index}`, actionId),
          ),
        ]
        this.tree.insertAfter(node.id, nodes)
      }
      node.resolve(result)
      return { type: 'ok', nodeId: node.id, result }
    }
    return { type: 'blocked', nodeId: node.id }
  }

  resolveChoice(
    choice: string,
    context: EngineContext,
  ): ActionExecutionResult {
    if (this.pendingChoiceNodeId) {
      const node = this.tree.findNodeById(this.pendingChoiceNodeId)
      if (node instanceof OptionalNode) {
        if (choice === '__skip__') {
          node.resolve()
          this.pendingChoiceNodeId = null
          this.pendingChoiceActionId = null
          return { type: 'ok' }
        }
        node.active = true
        this.pendingChoiceNodeId = null
        this.pendingChoiceActionId = null
        return { type: 'ok' }
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        if (choice === '__done__' && node instanceof OrNode) {
          node.resolve(choice)
          this.pendingChoiceNodeId = null
          return { type: 'ok' }
        }
        const targetNode = node.children.find((item) => item.id === choice)
        const child = targetNode ? this.findActionNode(targetNode) : null
        if (!child) {
          this.pendingChoiceNodeId = null
          return { type: 'ok' }
        }
        const actionId = child.actionId
        const action = this.registry.get(actionId)
        if (!action) {
          this.pendingChoiceNodeId = null
          return { type: 'fail', logKey: 'log.buildRoomFail' }
        }
        const executionContext: ActionExecutionContext = {
          state: context.state,
          player: context.player,
          space: context.space,
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
        this.hooks.before({ ...executionContext, actionId })
        const result = action.execute(executionContext)
        this.hooks.during({ ...executionContext, actionId }, result)
        if (result.type === 'choice') {
          child.resolve(result)
          const choiceNode = targetNode ? this.findChoiceNode(targetNode) : null
          if (choiceNode) {
            choiceNode.setChoice(result.promptKey, result.options)
            this.pendingChoiceNodeId = choiceNode.id
            this.pendingChoiceActionId = actionId
          } else {
            this.pendingChoiceNodeId = null
            this.pendingChoiceActionId = null
          }
          const argResults = this.hooks.computeArgs(
            { ...executionContext, actionId },
            result,
          )
          const extraOptions = argResults
            .flatMap((entry) => entry.extraOptions ?? [])
            .filter((option) => option)
          if (extraOptions.length > 0) {
            result.options = [...result.options, ...extraOptions]
          }
          return result
        }
        const immediateResults = this.hooks.immediatelyAfter(
          { ...executionContext, actionId },
          result,
        )
        this.log.append({
          key: 'log.action',
          params: { actionId },
        })
        const afterResults = this.hooks.after(
          { ...executionContext, actionId },
          result,
        )
        const hookFlows = [...immediateResults, ...afterResults]
          .map((entry) => entry.flow)
          .filter((flow) => flow)
          .map((flow) => this.buildFlowNode(flow as ActionFlow))
        const followUps = [...immediateResults, ...afterResults]
          .flatMap((entry) => entry.followUpActions ?? [])
          .filter((followUpAction) => followUpAction)
        if (hookFlows.length > 0 || followUps.length > 0) {
          const nodes = [
            ...hookFlows,
            ...followUps.map(
              (followUpAction, index) =>
                new ActionNode(`chain-${child.id}-${index}`, followUpAction),
            ),
          ]
          this.tree.insertAfter(child.id, nodes)
        }
        child.resolve(result)
        if (node instanceof XorNode) {
          node.resolve(choice)
        }
        this.pendingChoiceNodeId = null
        return result
      }
    }
    const actionId = this.pendingChoiceActionId
    if (!actionId) {
      return { type: 'ok' }
    }
    const action = this.registry.get(actionId)
    if (!action || !action.resolveChoice) {
      return { type: 'ok' }
    }
    const executionContext: ActionExecutionContext = {
      state: context.state,
      player: context.player,
      space: context.space,
    }
    const result = action.resolveChoice(executionContext, choice)
    this.hooks.during({ ...executionContext, actionId }, result)
    if (result.type === 'choice') {
      if (this.pendingChoiceNodeId) {
        const node = this.tree.findNodeById(this.pendingChoiceNodeId)
        if (node instanceof ChoiceNode) {
          node.setChoice(result.promptKey, result.options)
          this.pendingChoiceActionId = actionId
          return result
        }
      }
      this.pendingChoiceNodeId = null
      this.pendingChoiceActionId = null
      return result
    }
    if (result.type === 'flow') {
      const flowNode = this.buildFlowNode(result.flow)
      if (this.pendingChoiceNodeId) {
        this.tree.insertAfter(this.pendingChoiceNodeId, [flowNode])
      }
    }
    const immediateResults = this.hooks.immediatelyAfter(
      { ...executionContext, actionId },
      result,
    )
    const afterResults = this.hooks.after({ ...executionContext, actionId }, result)
    const hookFlows = [...immediateResults, ...afterResults]
      .map((entry) => entry.flow)
      .filter((flow) => flow)
      .map((flow) => this.buildFlowNode(flow as ActionFlow))
    const followUps = [...immediateResults, ...afterResults]
      .flatMap((entry) => entry.followUpActions ?? [])
      .filter((actionId) => actionId)
    if ((hookFlows.length > 0 || followUps.length > 0) && this.pendingChoiceNodeId) {
      const nodes = [
        ...hookFlows,
        ...followUps.map(
          (action, index) =>
            new ActionNode(`chain-${this.pendingChoiceNodeId}-${index}`, action),
        ),
      ]
      this.tree.insertAfter(this.pendingChoiceNodeId, nodes)
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
    this.pendingChoiceNodeId = null
    this.pendingChoiceActionId = null
    return result
  }
}
