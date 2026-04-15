import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E138_LivestockExpert'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 11) return

    // Count animals in pastures and house
    const pastureAnimals: Record<string, number> = {}
    for (const pasture of player.pastures) {
      if (pasture.animalType && pasture.animalCount > 0) {
        pastureAnimals[pasture.animalType] = (pastureAnimals[pasture.animalType] ?? 0) + pasture.animalCount
      }
    }
    if (player.houseAnimalType && player.houseAnimalCount > 0) {
      pastureAnimals[player.houseAnimalType] = (pastureAnimals[player.houseAnimalType] ?? 0) + player.houseAnimalCount
    }

    const animalTotals = [
      { type: 'sheep' as const, count: (player.resources.sheep ?? 0) + (pastureAnimals['sheep'] ?? 0) },
      { type: 'boar' as const, count: (player.resources.boar ?? 0) + (pastureAnimals['boar'] ?? 0) },
      { type: 'cattle' as const, count: (player.resources.cattle ?? 0) + (pastureAnimals['cattle'] ?? 0) },
    ].filter((a) => a.count > 0)

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
})

export const E138_LivestockExpert = new Occupation({
  id: CARD_ID,
  name: 'Livestock Expert',
  deck: 'E',
  number: 138,
  category: 'ANIMAL_HANDLER',
  desc: ['If you play this card in round 11 or before, choose an animal type: you immediately get a number of animals of that type equal to the number you already have on your farm.'],
  players: '3+',
})
