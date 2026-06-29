import { defineMinorCard } from '../card-source'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { canAccommodateAllAnimals } from '../../domain/animal-zones'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C009_AutomaticWaterTrough'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player): ActionFlow | undefined => {
      const sheepValid = canAccommodateAllAnimals(state, player, ['sheep'])
      const boarValid = canAccommodateAllAnimals(state, player, ['boar'])
      const cattleValid = canAccommodateAllAnimals(state, player, ['cattle'])
      const children: ActionFlow[] = []
      if (sheepValid) {
        children.push(gainLeaf(CARD_ID, { sheep: 1 }))
      }
      if (boarValid) {
        children.push({
          type: 'seq',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            gainLeaf(CARD_ID, { boar: 1 }),
          ],
        })
      }
      if (cattleValid) {
        children.push({
          type: 'seq',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
            gainLeaf(CARD_ID, { cattle: 1 }),
          ],
        })
      }
      if (children.length === 0) return undefined
      return {
        type: 'xor',
        optional: true,
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C009_AutomaticWaterTrough = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Automatic Water Trough',
    deck: 'C',
    number: 9,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['If you can accommodate the animal, you can immediately buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>.'],
    cost: { wood: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const C009_AutomaticWaterTrough_impl = C009_AutomaticWaterTrough.impl
