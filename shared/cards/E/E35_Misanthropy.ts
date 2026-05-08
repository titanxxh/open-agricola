import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E35_Misanthropy } from '../../cards-display/E/E35_Misanthropy'
export { E35_Misanthropy }

const CARD_ID = E35_Misanthropy.id

export const E35_Misanthropy_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const size = familySize(player)
    if (size === 2) return 5
    if (size === 3) return 3
    if (size === 4) return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
