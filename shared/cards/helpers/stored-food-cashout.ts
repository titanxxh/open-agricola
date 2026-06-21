import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { readCardExtraData } from './card-state'

export const STORED_FOOD_CASHED_OUT_KEY = 'cashedOut'

export const getStoredFood = (player: PlayerState, cardId: string): number =>
  player.cardStates?.[cardId]?.counters?.food ?? 0

export const hasCashedOutStoredFood = (player: PlayerState, cardId: string): boolean =>
  readCardExtraData<boolean>(player, cardId, STORED_FOOD_CASHED_OUT_KEY) === true

export const storeFoodOnCardFlow = (
  player: PlayerState,
  cardId: string,
  amount = 1,
): ActionFlow | undefined => {
  if (amount <= 0) return undefined
  if (hasCashedOutStoredFood(player, cardId)) return undefined
  const next = getStoredFood(player, cardId) + amount
  return {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'store-on-card', sourceCard: cardId, params: { food: amount } },
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: cardId,
        params: { kind: 'set-infobox', text: `${next} Food` },
      },
    ],
  }
}

const cashoutFlow = (player: PlayerState, cardId: string): ActionFlow | undefined => {
  const food = getStoredFood(player, cardId)
  if (food <= 0) return undefined
  if (hasCashedOutStoredFood(player, cardId)) return undefined
  return {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'take-from-card', sourceCard: cardId, params: { food } },
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: cardId,
        params: { kind: 'set-extra-data', key: STORED_FOOD_CASHED_OUT_KEY, value: true },
      },
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: cardId,
        params: { kind: 'set-infobox', text: 'Used' },
      },
    ],
  }
}

export const storedFoodCashoutListener = (
  cardId: string,
  listenerId: string,
): CardListenerRegistration => ({
  id: listenerId,
  cardIds: [cardId],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = cashoutFlow(context.player, cardId)
    if (!flow) return
    return {
      flow,
      sourceCard: cardId,
      labelKey: `cards.${cardId}.cashout`,
    }
  },
})
