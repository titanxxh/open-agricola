import { payGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B135_NutritionExpert } from '../../cards-display/B/B135_NutritionExpert'

const CARD_ID = B135_NutritionExpert.id

export const B135_NutritionExpert_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {

    const animalTypes = ['sheep', 'boar', 'cattle'] as const
    const availableAnimals = animalTypes.filter((a) => (player.resources[a] ?? 0) >= 1)
    const hasGrain = (player.resources.grain ?? 0) >= 1
    const hasVeg = (player.resources.vegetable ?? 0) >= 1

    if (availableAnimals.length === 0 || !hasGrain || !hasVeg) return

    const children = availableAnimals.map((animal) =>
      payGainActionFlow({
        cardId: CARD_ID,
        cost: { [animal]: 1, grain: 1, vegetable: 1 },
        gain: { food: 5, score: 2 },
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { [animal]: 1, grain: 1, vegetable: 1 }, resourcesGained: { food: 5 }, bonusVp: 2 },
      }),
    )

    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
