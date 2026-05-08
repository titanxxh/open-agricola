import type { CardImpl } from '../registry'
import { D29_MuckRake } from '../../cards-display/D/D29_MuckRake'
export { D29_MuckRake }

const CARD_ID = D29_MuckRake.id

export const D29_MuckRake_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const types = new Set(Object.values(player.stableAnimals ?? {}).filter(Boolean))
    let bonus = 0
    if (types.has('sheep')) bonus++
    if (types.has('boar')) bonus++
    if (types.has('cattle')) bonus++
    return bonus
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
