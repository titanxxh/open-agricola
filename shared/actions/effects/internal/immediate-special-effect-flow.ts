import type { ActionHookResult } from '../../hooks'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { specialEffectAction } from '../special-effect'

type ImmediateSpecialEffectInput = ActionHookResult | ActionFlow | undefined | void

type ExecuteImmediateSpecialEffectFlowsArgs = {
  state: GameState
  player: PlayerState
  space: ActionSpace
  results?: ImmediateSpecialEffectInput | readonly ImmediateSpecialEffectInput[]
}

const isActionFlow = (value: ImmediateSpecialEffectInput): value is ActionFlow =>
  typeof value === 'object' && value !== null && 'type' in value

const flowFromInput = (input: ImmediateSpecialEffectInput): ActionFlow | undefined => {
  if (!input) return undefined
  if (isActionFlow(input)) return input
  return input.flow
}

const executeFlow = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  flow: ActionFlow | undefined,
) => {
  if (!flow || flow.optional) return

  if (flow.type === 'leaf') {
    if (flow.actionId !== 'special-effect') return
    specialEffectAction.execute({
      state,
      player,
      space,
      sourceCard: flow.sourceCard,
      params: flow.params,
      actionContext: flow.actionContext,
    })
    return
  }

  if (flow.type === 'seq' || flow.type === 'parallel') {
    flow.children.forEach((child) => executeFlow(state, player, space, child))
  }
}

export const executeImmediateSpecialEffectFlows = ({
  state,
  player,
  space,
  results,
}: ExecuteImmediateSpecialEffectFlowsArgs) => {
  if (!results) return
  const inputs = Array.isArray(results) ? results : [results]
  inputs.forEach((input) => {
    executeFlow(state, player, space, flowFromInput(input))
  })
}
