import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../../contract/types'
import { flowCardEffectHooks, runCardEffectHook } from '../../../cards/card-effects'
import type { FlowCardEffectHook, PaymentInfo } from '../../../cards/card-effects'
import type { ActionHookResult } from '../../hooks'

const playerById = (state: GameState, playerId: unknown) =>
  typeof playerId === 'string'
    ? state.players.find((candidate) => candidate.id === playerId)
    : undefined

const effectPlayerForHook = (
  state: GameState,
  player: PlayerState,
  hook: FlowCardEffectHook,
  params?: Record<string, unknown>,
) => {
  if (hook !== 'onBeforeEndGame') return player
  return playerById(state, params?.targetPlayerId) ?? player
}

export const activateCardEffect = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: FlowCardEffectHook,
  paymentInfo?: PaymentInfo,
): ActionExecutionResult => {
  const flow = runCardEffectHook(state, player, cardId, hook, paymentInfo)
  if (flow) return { type: 'flow', flow }
  return { type: 'ok' }
}

export const previewActivateCardEffect = (
  state: GameState,
  player: PlayerState,
  params?: Record<string, unknown>,
  actionContext?: Record<string, unknown>,
): ActionHookResult | undefined => {
  const cardId = params?.cardId
  const hook = params?.hook
  if (typeof cardId !== 'string' || typeof hook !== 'string') return undefined
  if (!flowCardEffectHooks.includes(hook as FlowCardEffectHook)) return undefined
  if (hook !== 'onBeforeEndGame') return undefined
  const effectPlayer = effectPlayerForHook(state, player, hook as FlowCardEffectHook, params)
  const flow = runCardEffectHook(state, effectPlayer, cardId, hook as FlowCardEffectHook)
  if (!flow) return undefined
  return {
    flow,
    sourceCard: cardId,
    extraData: {
      ownerPlayerId: params?.ownerPlayerId,
      targetPlayerId: effectPlayer.id,
      beforeEndGameScope: params?.beforeEndGameScope,
      beforeEndGameDispatchMode: params?.beforeEndGameDispatchMode,
      beforeEndGameMandatory: params?.beforeEndGameMandatory,
      actionContext,
    },
  }
}

export const activateCardEffectAction: ActionDefinition = {
  id: 'activate-card-effect',
  nameKey: 'actions.activate-card-effect.name',
  descriptionKey: 'actions.activate-card-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, actionContext }) => {
    const cardId = params?.cardId
    const hook = params?.hook
    if (typeof cardId !== 'string' || typeof hook !== 'string') {
      return { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    if (!flowCardEffectHooks.includes(hook as FlowCardEffectHook)) {
      return { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    const paymentInfo = actionContext?.paymentInfo as PaymentInfo | undefined
    const effectPlayer = effectPlayerForHook(state, player, hook as FlowCardEffectHook, params)
    return activateCardEffect(state, effectPlayer, cardId, hook as FlowCardEffectHook, paymentInfo)
  },
}
