import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E158_StoneCustodian'

const STONE_SPACES = ['eastern-quarry', 'western-quarry']

// E158 Stone Custodian: At the end of each work phase, you get 1 food for each stone
// accumulation space with stone on it.
// BGA: EndWorkPhase → we use onBeforeReturnHome
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const count = STONE_SPACES.filter((id) => {
      const space = state.actionSpaces.find((s) => s.id === id)
      return (space?.resources?.stone ?? 0) > 0
    }).length
    if (count === 0) return
    return gainLeaf(CARD_ID, { food: count })
  },
})

export const E158_StoneCustodian = new Occupation({
  id: CARD_ID,
  name: 'Stone Custodian',
  deck: 'E',
  number: 158,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase, you get 1 <FOOD> for each stone accumulation space with stone on it.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
