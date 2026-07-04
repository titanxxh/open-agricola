import { defineOccupationCard } from '../card-source'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B179_WildBoarHunter'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeReturnHome: (state, player) => {
      if ((player.resources.wood ?? 0) < 1) return
      const occupiedWoodSpaces = state.actionSpaces.filter((space) =>
        isWoodAccumulationSpaceId(space.id) && space.takenBy.length > 0,
      ).length
      if (occupiedWoodSpaces < 3) return
      return payGainFlow({ cardId: CARD_ID, cost: { wood: 1 }, gain: { boar: 1 } })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B179_WildBoarHunter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wild Boar Hunter',
    deck: 'B',
    number: 179,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['In the returning home phase of each round, if at least 3 <WOOD> accumulation spaces are occupied, you can pay 1 <WOOD> to get 1 <<PIG>>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B179_WildBoarHunter_impl = B179_WildBoarHunter.impl
