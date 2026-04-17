import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E159_OldMiser'

/**
 * E159 Old Miser (Occupation, E, 159)
 * In the feeding phase of each harvest, each of your people requires 1 less food.
 * During scoring, your people are worth 2 points each instead of 3.
 *
 * BGA: onBuy triggers a harvest cost notification and score recompute.
 * Main effects are in Player.php getHarvestCost() and Scores.php computeFarmers().
 *
 * Implementation:
 * - onBeforeFeed: give the player familySize extra food to simulate -1 food per person.
 *   Normal formula: familySize * 2 - newborn. With familySize extra food the effective
 *   cost becomes familySize - newborn (adults need 1, newborns need 0).
 * - computePostScore: subtract familySize VP (changing 3 VP/person to 2 VP/person).
 */

registerCardEffect({
  id: CARD_ID,
  onBeforeFeed: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Give familySize extra food to offset the -1 food per person reduction.
    // The feeding formula is: required = max(0, familySize * 2 - newborn)
    // With familySize extra food: effective cost = familySize * 2 - newborn - familySize
    //   = familySize - newborn, which is adults * 1 + newborns * 0.
    player.resources.food += player.familySize
  },
  computePostScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    // Normal scoring: familySize * 3. With Old Miser: familySize * 2.
    // Difference: -familySize (i.e., -1 per person).
    return -player.familySize
  },
})

export const E159_OldMiser = new Occupation({
  id: CARD_ID,
  name: 'Old Miser',
  deck: 'E',
  number: 159,
  category: 'FOOD_MISC',
  desc: ['In the feeding phase of each harvest, each of your people requires 1\u00a0less <FOOD>. During scoring, your people are worth 2 points each instead of 3.'],
  players: '4+',
})
