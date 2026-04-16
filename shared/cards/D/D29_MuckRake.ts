import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D29_MuckRake'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return Object.values(player.stableAnimals ?? {}).filter(Boolean).length
  },
})

export const D29_MuckRake = new MinorImprovement({
  id: CARD_ID,
  name: "Muck Rake",
  deck: "D",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, you get 1 bonus <SCORE> for exactly 1 unfenced stable holding exactly 1 <SHEEP>. The same applies to <PIG> and <CATTLE>, if held in different unfenced stables.',
  ],
  cost: {},
})
