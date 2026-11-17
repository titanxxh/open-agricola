import { defineOccupationCard } from '../card-source'
import { bonusVpLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { animalKeysForState } from '../../contract/animals'
import type { ActionFlow } from '../../contract/types'

const CARD_ID = 'B135_NutritionExpert'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => {

      const animalTypes = animalKeysForState(state)
      const availableAnimals = animalTypes.filter((a) => (player.resources[a] ?? 0) >= 1)
      const hasGrain = (player.resources.grain ?? 0) >= 1
      const hasVeg = (player.resources.vegetable ?? 0) >= 1

      if (availableAnimals.length === 0 || !hasGrain || !hasVeg) return

      const children = availableAnimals.map<ActionFlow>((animal) => ({
        type: 'seq',
        children: [
          {
            type: 'leaf', actionId: 'exchange', sourceCard: CARD_ID,
            actionContext: {
              directTrade: {
                from: { [animal]: 1, grain: 1, vegetable: 1 },
                to: { food: 5 },
                sourceId: CARD_ID,
              },
            },
          },
          bonusVpLeaf(CARD_ID, 2),
        ],
      }))

      return { type: 'xor', optional: true, children }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B135_NutritionExpert = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Nutrition Expert',
    deck: 'B',
    number: 135,
    category: 'POINTS_PROVIDER',
    desc: ['At the start of each round, you can exchange a set comprised of 1 animal of any type, 1 <GRAIN>, and 1 <VEGETABLE> for 5 <FOOD> and 2 bonus <SCORE>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B135_NutritionExpert_impl = B135_NutritionExpert.impl
