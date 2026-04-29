import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { computeAnimalZones } from '../../actions/effects/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'A134_FullFarmer'

export const A134_FullFarmer = new Occupation({
  id: CARD_ID,
  name: "Full Farmer",
  deck: "A",
  number: 134,
  category: "POINTS_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. During scoring, you get 1 bonus <SCORE> for each pasture you have holding the maximum number of animals."],
  cost: {},
  players: "1+",
  extraVp: true,
})

export const A134_FullFarmer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
  computeBonusScore: (_state, player) => {
    const zones = computeAnimalZones(player)
    return zones.filter((z) => z.zoneType === 'pasture' && z.capacity > 0 && (z.animalCount ?? 0) >= z.capacity).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
