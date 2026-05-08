import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { C97_SeedResearcher } from '../../cards-display/C/C97_SeedResearcher'

const CARD_ID = C97_SeedResearcher.id

export const C97_SeedResearcher_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    const vegSeeds = state.actionSpaces.find((s) => s.id === 'vegetable-seeds')
    if (!grainSeeds || !vegSeeds) return
    if (!isSpaceOccupied(grainSeeds) || !isSpaceOccupied(vegSeeds)) return

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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
