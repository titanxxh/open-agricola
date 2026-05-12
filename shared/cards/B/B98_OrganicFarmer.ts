import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'
import { B98_OrganicFarmer } from '../../cards-display/B/B98_OrganicFarmer'

const CARD_ID = B98_OrganicFarmer.id

export const B98_OrganicFarmer_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const idx = state.players.findIndex((p) => p.id === player.id)
    if (idx < 0) return 0
    const zones = playerBoard(state, idx).animals.zones()
    return zones.filter((z) => z.zoneType === 'pasture' && (z.animalCount ?? 0) > 0 && z.capacity - (z.animalCount ?? 0) >= 3).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
