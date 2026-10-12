import type { ActionFlow, PlayerState } from '../../contract/types'
export type CounterAnimalCapacityRule = { counter: string; capacityPerUnit: number }
export const counterAnimalCapacityFlow = (cardId: string, rule: CounterAnimalCapacityRule, amount: number): ActionFlow => ({
  type: 'leaf', actionId: 'add-animal-capacity', sourceCard: cardId, params: { ...rule, amount },
})
export const readCounterAnimalCapacity = (player: PlayerState, cardId: string, rule: CounterAnimalCapacityRule): number =>
  (player.cardStates?.[cardId]?.counters?.[rule.counter] ?? 0) * rule.capacityPerUnit
