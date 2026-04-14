import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B158_DistrictManager'

// B158 District Manager: At the end of each work phase, if you used both the Forest and
// Grove accumulation spaces, you get 5 food.
// BGA fires this at EndWorkPhase; we use onBeforeReturnHome.
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const grove = state.actionSpaces.find((s) => s.id === 'grove')
    if (forest?.takenBy !== player.id || grove?.takenBy !== player.id) return
    return gainLeaf(CARD_ID, { food: 5 })
  },
})

export const B158_DistrictManager = new Occupation({
  id: CARD_ID,
  name: 'District Manager',
  deck: 'B',
  number: 158,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase, if you used both the __Forest__ and __Grove__ accumulation spaces, you get 5 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})
