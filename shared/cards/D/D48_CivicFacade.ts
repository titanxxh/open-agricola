import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D48_CivicFacade } from '../../cards-display/D/D48_CivicFacade'

const CARD_ID = D48_CivicFacade.id

export const D48_CivicFacade_impl = {
  prerequisiteCheck: (player) => player.rooms >= 3,
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    const occs = player.occupationHand.length
    const improvements = player.minorHand.length
    if (occs <= improvements) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
