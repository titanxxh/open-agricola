import type { ActionHookRegistry } from '../../hooks'
import { createInitialState } from '../../../session/state-bootstrap'
import type { GameState, PlayerState, PaymentResourceMap, ComplexCost, CostModifierType } from '../../../contract/types'
import { PaymentSolver, type Cost } from '..'

export const stateWithPaymentPlayer = (player: PlayerState, state?: GameState): { state: GameState; playerIndex: number } => {
  if (state) {
    const index = state.players.indexOf(player)
    return { state, playerIndex: index >= 0 ? index : 0 }
  }
  return {
    state: { ...createInitialState(42, { playerCount: 2 }), players: [player] },
    playerIndex: 0,
  }
}

export const computePaymentOptionsForTest = (
  player: PlayerState,
  cost: Cost,
  costType: CostModifierType | 'none' = 'none',
  state?: GameState,
  playedCards?: string[],
) => {
  const payment = stateWithPaymentPlayer(player, state)
  return PaymentSolver.computeOptions(payment.state, payment.playerIndex, cost, {
    actionId: 'test-payment',
    costType,
    playedCards,
  })
}

export const resolveCardCostDetailedForTest = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
  actionHooks?: ActionHookRegistry,
) =>
  PaymentSolver.resolveCardPreviewCostDetailedByProvider(
    state,
    player,
    actionId,
    cardId,
    () => baseCost,
    actionCardId,
    actionHooks,
  )

export const resolveCardCostForTest = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
  actionHooks?: ActionHookRegistry,
) => {
  const result = resolveCardCostDetailedForTest(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
    actionHooks,
  )
  if (result === null) throw new Error(`No test cost resolved for ${cardId} on ${actionId}`)
  return result.cost
}
