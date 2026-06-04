import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D29_MuckRake'

const cardImpl = {
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

export const D29_MuckRake = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Muck Rake",
    deck: "D",
    number: 29,
    category: "POINTS_PROVIDER",
    desc: [
        'During scoring, you get 1 bonus <SCORE> for exactly 1 unfenced stable holding exactly 1 <SHEEP>. The same applies to <PIG> and <CATTLE>, if held in different unfenced stables.',
      ],
    cost: { wood: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const D29_MuckRake_impl = D29_MuckRake.impl
