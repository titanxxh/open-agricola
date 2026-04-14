import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C97_SeedResearcher'

// C97 Seed Researcher: Each time any people return from both the Grain Seeds and
// Vegetable Seeds action spaces, you get 2 food and you can play 1 occupation for free.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    const vegSeeds = state.actionSpaces.find((s) => s.id === 'vegetable-seeds')
    if (!grainSeeds?.takenBy || !vegSeeds?.takenBy) return

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
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesGained: { food: 2 } },
        },
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
            {
              type: 'leaf',
              actionId: 'play-occupation',
              sourceCard: CARD_ID,
              params: { costOverride: {} },
            },
          ],
          choiceLabelKey: 'ui.interactionSeedResearcher',
        },
      ],
    }
  },
})

export const C97_SeedResearcher = new Occupation({
  id: CARD_ID,
  name: 'Seed Researcher',
  deck: 'C',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time any people return from both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you get 2 <FOOD> and you can play 1 occupation, without paying an occupation cost.'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
