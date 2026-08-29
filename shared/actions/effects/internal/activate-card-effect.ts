import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../../contract/types'
import { flowCardEffectHooks, runCardEffectHook } from '../../../cards/card-effects'
import type { FlowCardEffectHook, FlowEffectContext, PaymentInfo } from '../../../cards/card-effects'
import type { ActionHookResult } from '../../hooks'
import { findPlayerById } from '../../../domain/player'

const effectPlayerForHook = (
  state: GameState,
  player: PlayerState,
  hook: FlowCardEffectHook,
  params?: Record<string, unknown>,
) => {
  const targetPlayer = findPlayerById(state, params?.targetPlayerId)
  if (targetPlayer) return targetPlayer
  if (hook !== 'onBeforeEndGame') return player
  return player
}

const jsonSnapshot = (state: GameState, player: PlayerState): string =>
  JSON.stringify({ state, player })

const readFlowEffectContext = (
  params?: Record<string, unknown>,
  reportProtectedObservation?: FlowEffectContext['reportProtectedObservation'],
): FlowEffectContext | undefined =>
  typeof params?.triggerActionId === 'string' || reportProtectedObservation
    ? {
        ...(typeof params?.triggerActionId === 'string'
          ? { triggerActionId: params.triggerActionId }
          : {}),
        ...(reportProtectedObservation ? { reportProtectedObservation } : {}),
      }
    : undefined

export const activateCardEffect = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: FlowCardEffectHook,
  paymentInfo?: PaymentInfo,
  context?: FlowEffectContext,
): ActionExecutionResult => {
  const flow = runCardEffectHook(state, player, cardId, hook, paymentInfo, context)
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
  const effectPlayer = effectPlayerForHook(state, player, hook as FlowCardEffectHook, params)
  const before = jsonSnapshot(state, effectPlayer)
  const flow = runCardEffectHook(
    state,
    effectPlayer,
    cardId,
    hook as FlowCardEffectHook,
    undefined,
    readFlowEffectContext(params),
  )
  const mutated = !flow && jsonSnapshot(state, effectPlayer) !== before
  if (!flow && !mutated) return undefined
  return {
    flow: flow ?? undefined,
    doable: true,
    sourceCard: cardId,
    extraData: {
      ownerPlayerId: params?.ownerPlayerId,
      targetPlayerId: effectPlayer.id,
      beforeEndGameScope: params?.beforeEndGameScope,
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
  execute: ({ state, player, params, actionContext, reportProtectedObservation }) => {
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
    return activateCardEffect(
      state,
      effectPlayer,
      cardId,
      hook as FlowCardEffectHook,
      paymentInfo,
      readFlowEffectContext(params, reportProtectedObservation),
    )
  },
}
