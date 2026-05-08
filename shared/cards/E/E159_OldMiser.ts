import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E159_OldMiser } from '../../cards-display/E/E159_OldMiser'
export { E159_OldMiser }

const CARD_ID = E159_OldMiser.id

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
