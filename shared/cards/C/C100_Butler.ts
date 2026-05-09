import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C100_Butler } from '../../cards-display/C/C100_Butler'

const CARD_ID = C100_Butler.id

export const C100_Butler_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.rooms > familySize(player) ? 4 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
