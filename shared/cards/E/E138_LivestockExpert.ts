import { getPlacedAnimalsByType } from '../../domain/animal-zones'
import { defineOccupationCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E138_LivestockExpert'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 11) return

    const placed = getPlacedAnimalsByType(player, state)
    const animalTotals = [
      { type: 'sheep' as const, count: placed.sheep ?? 0 },
      { type: 'boar' as const, count: placed.boar ?? 0 },
      { type: 'cattle' as const, count: placed.cattle ?? 0 },
    ].filter((animal) => animal.count > 0)

    if (animalTotals.length === 0) return

    const children: ActionFlow[] = animalTotals.map((a) => ({
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { [a.type]: a.count },
    }))

    return {
      type: 'xor' as const,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E138_LivestockExpert = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Livestock Expert',
    deck: 'E',
    number: 138,
    category: 'GOODS_-_GET',
    desc: ['If you play this card in round 11 or before, choose an animal type: you immediately get a number of animals of that type equal to the number you already have on your farm.'],
    players: '3+',
  },
  impl: cardImpl,
})

export const E138_LivestockExpert_impl = E138_LivestockExpert.impl
