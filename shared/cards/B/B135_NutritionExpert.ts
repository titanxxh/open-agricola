import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payGainActionFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'B135_NutritionExpert'

// B135 Nutrition Expert: At the start of each round, you can exchange a set comprised of
// 1 animal of any type, 1 grain, and 1 vegetable for 5 food and 2 bonus VP.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

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
})

export const B135_NutritionExpert = new Occupation({
  id: CARD_ID,
  name: 'Nutrition Expert',
  deck: 'B',
  number: 135,
  category: 'POINTS_PROVIDER',
  desc: ['At the start of each round, you can exchange a set comprised of 1 animal of any type, 1 <GRAIN>, and 1 <VEGETABLE> for 5 <FOOD> and 2 bonus <SCORE>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
