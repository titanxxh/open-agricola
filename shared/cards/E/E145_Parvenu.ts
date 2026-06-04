import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E145_Parvenu'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 7) return

    const clays = player.resources.clay ?? 0
    const reeds = player.resources.reed ?? 0

    if (clays <= 0 && reeds <= 0) return

    if (clays > 0 && reeds <= 0) {
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { clay: clays },
      }
    }

    if (clays <= 0 && reeds > 0) {
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { reed: reeds },
      }
    }

    // Both available — player chooses
    return {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { clay: clays },
        },
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { reed: reeds },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E145_Parvenu = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Parvenu',
    deck: 'E',
    number: 145,
    category: 'BUILDING_RESOURCES_-_REED',
    desc: ['If you play this card in round 7 or before, choose <CLAY> or <REED>: you immediately get a number of that building resource equal to the number you already have in your supply.'],
    players: '3+',
  },
  impl: cardImpl,
})

export const E145_Parvenu_impl = E145_Parvenu.impl
