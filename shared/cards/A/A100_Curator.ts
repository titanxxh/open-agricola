import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import { getReturningPersonPlacements } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'A100_Curator'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    const accumulationSpaces = new Set(state.actionSpaces.filter(
      (space) => Object.values(space.gainPerRound ?? {}).some((value) => value > 0),
    ).map((space) => space.id))
    const farmersOnAccumulation = new Set(getReturningPersonPlacements(state)
      .filter((entry) => entry.playerId === player.id && accumulationSpaces.has(entry.spaceId))
      .map((entry) => entry.workerId)).size
    if (farmersOnAccumulation < 3) return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A100_Curator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Curator',
    deck: 'A',
    number: 100,
    category: 'POINTS_PROVIDER',
    desc: ['In the returning home phase of each round, if you return at least 3 people from accumulation spaces, you can buy 1 bonus <SCORE> for 1 <FOOD>.'],
    cost: {},
    players: '1+',
    evenMoreSet: true,
    extraVp: true,
  },
  impl: cardImpl,
})

export const A100_Curator_impl = A100_Curator.impl
