import { defineOccupationCard } from '../card-source'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'A172_BoatPainter'
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeReturnHome: (state) => {
      const fishingOccupied = state.actionSpaces.some((space) =>
        space.id === 'fishing' && isSpaceOccupied(space))
      const travelingPlayersOccupied = state.actionSpaces.some((space) =>
        isTravelingPlayersSpaceId(space.id) && isSpaceOccupied(space))
      if (!fishingOccupied || !travelingPlayersOccupied) return
      return {
        type: 'xor' as const,
        children: [
          gainLeaf(CARD_ID, { grain: 1 }),
          gainLeaf(CARD_ID, { food: 2 }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A172_BoatPainter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Boat Painter',
    deck: 'A',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['At the end of each work phase, if both the __Fishing__ and __Traveling Players__ accumulation spaces are occupied, you get your choice of 1 <GRAIN> or 2 <FOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A172_BoatPainter_impl = A172_BoatPainter.impl
