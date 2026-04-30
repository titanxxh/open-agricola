import { Occupation } from '../types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E159_OldMiser'

export const E159_OldMiser = new Occupation({
  id: CARD_ID,
  name: 'Old Miser',
  deck: 'E',
  number: 159,
  category: 'FOOD',
  desc: ['In the feeding phase of each harvest, each of your people requires 1\u00a0less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
  players: '4+',
})

export const E159_OldMiser_impl = {
  effect: {
  id: CARD_ID,
  onBeforeFeed: (_state, player) => {
    // Give familySize extra food to offset the -1 food per person reduction.
    // The feeding formula is: required = max(0, familySize * 2 - newborn)
    // With familySize extra food: effective cost = familySize * 2 - newborn - familySize
    //   = familySize - newborn, which is adults * 1 + newborns * 0.
    player.resources.food += familySize(player)
  },
  computeBonusScore: (_state, player) => {
    // Normal scoring: familySize * 3. With Old Miser: familySize * 2.
    // Difference: -familySize (i.e., -1 per person).
    return -familySize(player)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
