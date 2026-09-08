import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getReturnHomePlacements } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'C097_SeedResearcher'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    const returning = getReturnHomePlacements(state)
    if (!returning.some((entry) => entry.spaceId === 'grain-seeds') ||
      !returning.some((entry) => entry.spaceId === 'vegetable-seeds')) return

    if (player.occupationHand.length === 0) {
      return gainLeaf(CARD_ID, { food: 2 })
    }

    return {
      type: 'xor',
      children: [
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
          ],
        },
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
            {
              type: 'leaf',
              actionId: 'occupation',
              sourceCard: CARD_ID,
              params: { exactCost: {} },
            },
          ],
          choiceLabelKey: 'ui.interactionSeedResearcher',
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C097_SeedResearcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seed Researcher',
    deck: 'C',
    number: 97,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time any people return from both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you get 2 <FOOD> and you can play 1 occupation, without paying an occupation cost.'],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const C097_SeedResearcher_impl = C097_SeedResearcher.impl
