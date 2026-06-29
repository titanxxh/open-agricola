import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E058_LunchtimeBeer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, _player) => ({
      type: 'seq',
      optional: true,
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'set-extra-data',
            key: 'passFieldAndBreedRound',
            value: state.round,
          },
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E058_LunchtimeBeer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lunchtime Beer',
    deck: 'E',
    number: 58,
    category: 'FOOD',
    desc: ['At the start of each harvest, you can choose to skip the field and breeding phase of that harvest and get exactly 1 <FOOD> instead.'],
    cost: {},
  },
  impl: cardImpl,
})

export const E058_LunchtimeBeer_impl = E058_LunchtimeBeer.impl
