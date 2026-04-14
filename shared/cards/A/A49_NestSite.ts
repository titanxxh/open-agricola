import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A49_NestSite'

// A49 Nest Site: Each time 1 reed is placed on a non-empty Reed Bank accumulation space
// during the preparation phase (resource accumulation), you get 1 food.
// In our engine, this corresponds to onBeforeStartOfTurn: if the reed-bank space already
// has reed on it (from a previous round), we gain 1 food before the new reed is added.
// BGA fires this during "Preparation" which is the resource accumulation step.
// We check if reed-bank has >= 1 reed BEFORE the new round's accumulation (onBeforeStartOfTurn).
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Check if reed-bank currently has reed on it (i.e., no one took it last round)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank || (reedBank.resources?.reed ?? 0) <= 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const A49_NestSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Nest Site',
  deck: 'A',
  number: 49,
  category: 'FOOD_PROVIDER',
  desc: ['Each time 1 <REED> is placed on a non-empty __Reed Bank__ accumulation space during the preparation phase, you get 1 <FOOD>.'],
  cost: { food: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
