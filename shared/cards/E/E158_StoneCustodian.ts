import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E158_StoneCustodian'
const STONE_SPACES = ['eastern-quarry', 'western-quarry']

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, _player) => {
    const count = STONE_SPACES.filter((id) => {
      const space = state.actionSpaces.find((s) => s.id === id)
      return (space?.resources?.stone ?? 0) > 0
    }).length
    if (count === 0) return
    return gainLeaf(CARD_ID, { food: count })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E158_StoneCustodian = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stone Custodian',
    deck: 'E',
    number: 158,
    category: 'FOOD',
    desc: ['At the end of each work phase, you get 1 <FOOD> for each stone accumulation space with stone on it.'],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const E158_StoneCustodian_impl = E158_StoneCustodian.impl
