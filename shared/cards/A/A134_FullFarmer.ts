import { gainLeaf } from '../helpers/pay-gain-node'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'
import { A134_FullFarmer } from '../../cards-display/A/A134_FullFarmer'

const CARD_ID = A134_FullFarmer.id

export const A134_FullFarmer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
  computeBonusScore: (state, player) => {
    const idx = state.players.findIndex((p) => p.id === player.id)
    if (idx < 0) return 0
    const zones = playerBoard(state, idx).animals.zones()
    return zones.filter((z) => z.zoneType === 'pasture' && z.capacity > 0 && (z.animalCount ?? 0) >= z.capacity).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
