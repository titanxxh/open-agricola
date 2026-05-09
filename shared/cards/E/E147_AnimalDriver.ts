import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E147_AnimalDriver } from '../../cards-display/E/E147_AnimalDriver'

const CARD_ID = E147_AnimalDriver.id

export const E147_AnimalDriver_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    // Count fenced stables: sum of stables inside pastures
    const fencedStables = player.pastures.reduce((sum, pasture) => sum + pasture.stables, 0)
    if (fencedStables === 0) return

    // 1 fenced stable → sheep; 2 → pig; 3+ → cattle
    if (fencedStables >= 3) return gainLeaf(CARD_ID, { cattle: 1 })
    if (fencedStables === 2) return gainLeaf(CARD_ID, { boar: 1 })
    return gainLeaf(CARD_ID, { sheep: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
