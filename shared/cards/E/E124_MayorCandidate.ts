import type { CardImpl } from '../registry'
import { E124_MayorCandidate } from '../../cards-display/E/E124_MayorCandidate'

const CARD_ID = E124_MayorCandidate.id

export const E124_MayorCandidate_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return -((player.resources.wood ?? 0) + (player.resources.stone ?? 0))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
