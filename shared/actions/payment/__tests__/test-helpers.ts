import type { GameState, PlayerState, PaymentResourceMap, ComplexCost, CostModifierType } from '../../../contract/types'
import { PaymentSolver, type Cost } from '..'

export const stateWithPaymentPlayer = (player: PlayerState, state?: GameState): { state: GameState; playerIndex: number } => {
  if (state) {
    const index = state.players.indexOf(player)
    return { state, playerIndex: index >= 0 ? index : 0 }
  }
  return {
    state: { players: [player] } as GameState,
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
) =>
  PaymentSolver.resolveCardPreviewCostDetailedByProvider(
    state,
    player,
    actionId,
    cardId,
    () => baseCost,
    actionCardId,
  )

export const resolveCardCostForTest = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
) =>
  resolveCardCostDetailedForTest(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  ).cost
