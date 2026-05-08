import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { D48_CivicFacade } from '../../cards-display/D/D48_CivicFacade'
export { D48_CivicFacade }

const CARD_ID = D48_CivicFacade.id

registerPrerequisite('3 Rooms', (player) => player.rooms >= 3)

export const D48_CivicFacade_impl = {
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
