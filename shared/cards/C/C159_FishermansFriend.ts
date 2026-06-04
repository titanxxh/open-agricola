import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C159_FishermansFriend'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const travelingPlayers = state.actionSpaces.find((s) => s.id === 'traveling-players')
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    const tpFood = travelingPlayers?.resources?.food ?? 0
    const fishFood = fishing?.resources?.food ?? 0
    const diff = tpFood - fishFood
    if (diff <= 0) return
    return gainLeaf(CARD_ID, { food: diff })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C159_FishermansFriend = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Fisherman's Friend",
    deck: 'C',
    number: 159,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of each round, if there is more <FOOD> on the __Traveling Players__ than on the __Fishing__ accumulation space, you get the difference from the general supply.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C159_FishermansFriend_impl = C159_FishermansFriend.impl
