import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D54_TroutPool'

// D54 Trout Pool: At the start of each work phase, if there are at least 3 food on the
// Fishing accumulation space, you get 1 food from the general supply.
// BGA: startOfWork → we use onRoundStart
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    const fishFood = fishingSpace?.resources?.food ?? 0
    if (fishFood < 3) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const D54_TroutPool = new MinorImprovement({
  id: CARD_ID,
  name: 'Trout Pool',
  deck: 'D',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each work phase, if there are at least 3 <FOOD> on the __Fishing__ accumulation space, you get 1 <FOOD> from the general supply.'],
  cost: { clay: 2 },
  vp: 1,
  newSet: true,
})
