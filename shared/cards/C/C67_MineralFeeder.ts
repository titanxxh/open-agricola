import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C67_MineralFeeder'

const harvestRounds = [4, 7, 9, 11, 13, 14]

/**
 * C67 Mineral Feeder — At the start of each round that does not end with a harvest,
 * if you have at least 1 sheep in a pasture, you get 1 grain.
 *
 * BGA reference: onPlayerStartOfTurn — checks pastures for sheep.
 * Simplification: we check pasture animal assignments directly.
 * The BGA version also offers reorganize; we skip that complexity.
 */

const hasSheepInPasture = (player: import('../../game/types').PlayerState): boolean =>
  player.pastures.some(
    (pasture) => pasture.animalType === 'sheep' && pasture.animalCount > 0,
  )

export const C67_MineralFeeder = new MinorImprovement({
  id: CARD_ID,
  name: 'Mineral Feeder',
  deck: 'C',
  number: 67,
  category: 'CROP_PROVIDER',
  desc: ['At the start of each round that does not end with a harvest, if you have at least 1 <SHEEP> in a pasture, you get 1 <GRAIN>.'],
  cost: { reed: 1 },
  vp: 1,
  newSet: true,
})

export const C67_MineralFeeder_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    if (!hasSheepInPasture(player)) return
    return gainLeaf(CARD_ID, { grain: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
