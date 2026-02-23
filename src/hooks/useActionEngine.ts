import { useMemo, useRef } from 'react'
import { actionDefinitions } from '../../shared/actions'
import { internalActionDefinitions } from '../../shared/actions/internal-actions'
import { applyIsDoableHooks, clearActionHooks } from '../../shared/actions/hooks'
import { registerCardHooks } from '../../shared/actions/hooks/card-hooks'
import {
  ActionNode,
  ActionRegistry,
  ChoiceNode,
  Engine,
  EngineTree,
  HookDispatcher,
  LogStore,
  OptionalNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from '../../shared/engine'
import type { EngineNode } from '../../shared/engine'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../shared/game/types'

export const useActionEngine = () => {
  const engineRef = useRef<Engine | null>(null)
  const actionRegistry = useMemo(() => {
    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    return registry
  }, [])
  useMemo(() => {
    clearActionHooks()
    registerCardHooks()
  }, [])
  const hookDispatcher = useMemo(() => new HookDispatcher(), [])
  const engineLog = useMemo(() => new LogStore(), [])
  const createEngine = (actionId: string) => {
    const action = actionRegistry.get(actionId)
    let nodeCounter = 0
    const buildFlowNode = (flow: ActionFlow): EngineNode => {
      if (flow.type === 'leaf') {
        const actionNode = new ActionNode(
          `action-${flow.actionId}-${nodeCounter++}`,
          flow.actionId,
        )
        const definition = actionRegistry.get(flow.actionId)
        if (definition?.resolveChoice) {
          const sequence = new SequenceNode(`sequence-${flow.actionId}-${nodeCounter++}`, [
            actionNode,
            new ChoiceNode(`choice-${flow.actionId}-${nodeCounter++}`, []),
          ])
          return flow.optional
            ? new OptionalNode(`optional-${nodeCounter++}`, sequence, flow.promptKey)
            : sequence
        }
        return flow.optional
          ? new OptionalNode(`optional-${nodeCounter++}`, actionNode, flow.promptKey)
          : actionNode
      }
      const children = flow.children.map((child) => buildFlowNode(child))
      if (flow.type === 'seq') {
        const sequence = new SequenceNode(`sequence-${nodeCounter++}`, children)
        return flow.optional
          ? new OptionalNode(`optional-${nodeCounter++}`, sequence, flow.promptKey)
          : sequence
      }
      if (flow.type === 'parallel') {
        const parallel = new ParallelNode(`parallel-${nodeCounter++}`, children)
        return flow.optional
          ? new OptionalNode(`optional-${nodeCounter++}`, parallel, flow.promptKey)
          : parallel
      }
      if (flow.type === 'xor') {
        const xor = new XorNode(`xor-${nodeCounter++}`, children, flow.promptKey)
        return flow.optional
          ? new OptionalNode(`optional-${nodeCounter++}`, xor, flow.promptKey)
          : xor
      }
      const or = new OrNode(`or-${nodeCounter++}`, children, flow.promptKey)
      return flow.optional
        ? new OptionalNode(`optional-${nodeCounter++}`, or, flow.promptKey)
        : or
    }
    const actionNode = new ActionNode(`action-${actionId}`, actionId)
    const root = action?.flow
      ? buildFlowNode(action.flow)
      : action?.resolveChoice
        ? new SequenceNode(`sequence-${actionId}`, [
            actionNode,
            new ChoiceNode(`choice-${actionId}`, []),
          ])
        : actionNode
    return new Engine({
      tree: new EngineTree(root),
      registry: actionRegistry,
      hooks: hookDispatcher,
      log: engineLog,
    })
  }

  const canTakeAction = (
    state: GameState,
    space: ActionSpace,
    player: PlayerState,
    roundOpenById: Map<string, number>,
    isActionForPlayerCount: (space: ActionSpace, playerCount: number) => boolean,
  ) => {
    if (state.gameOver) return false
    if (space.takenBy) return false
    if (!isActionForPlayerCount(space, state.players.length)) return false
    const openRound = roundOpenById.get(space.id) ?? space.roundAvailable
    if (state.round < openRound) return false
    if (player.workersAvailable <= 0) return false
    return applyIsDoableHooks(
      { state, player, space, actionId: space.id },
      space.canBeExecutedByPlayer(state, player),
    )
  }

  return { engineRef, createEngine, canTakeAction }
}
