import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D60_LargePottery'

/**
 * D60 Large Pottery — dual-type minor that also counts as a major (BGA
 * `getOtherCardTypes() == [MAJOR]`). Buying it replaces the native
 * Major_Pottery major improvement (returnCards infrastructure). Anytime
 * exchange CLAY → 2 FOOD. Endgame score from reserved CLAY, matching
 * BGA's scoresMap (3-4→1, 5→2, 6→3, 7+→4). `extraVp: true` flags the card
 * as carrying its own scoring rule on top of the printed `vp: 3`.
 */

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const clay = player.resources.clay
    if (clay >= 7) return 4
    if (clay >= 6) return 3
    if (clay >= 5) return 2
    if (clay >= 3) return 1
    return 0
  },
})

export const D60_LargePottery = new MinorImprovement({
  id: CARD_ID,
  name: 'Large Pottery',
  deck: 'D',
  number: 60,
  category: 'FOOD_PROVIDER',
  desc: [
    '[Anytime]',
    '<CLAY> <ARROW> 2<FOOD>',
    '[Scoring]',
    '3/5/6/7<CLAY> <ARROW-1X> 1/2/3/4<SCORE>',
  ],
  cost: { clay: 1, stone: 1 },
  vp: 3,
  extraVp: true,
  prerequisite: 'Return the Pottery',
  returnCards: ['Major_Pottery'],
  alsoCountsAs: ['major'],
  evenMoreSet: true,
  exchanges: [
    { from: { clay: 1 }, to: { food: 2 }, trigger: 'anytime' },
  ],
})
