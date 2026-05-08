import type { CardImpl } from '../registry'
import { C134_CowPrince } from '../../cards-display/C/C134_CowPrince'
export { C134_CowPrince }

const CARD_ID = C134_CowPrince.id

export const C134_CowPrince_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    let count = 0
    count += player.pastures.filter((p) => p.animalType === 'cattle' && p.animalCount > 0).length
    if (player.houseAnimalType === 'cattle' && player.houseAnimalCount > 0) count += 1
    count += Object.values(player.stableAnimals ?? {}).filter((t) => t === 'cattle').length
    return count
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
