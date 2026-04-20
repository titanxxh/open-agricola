import { MinorImprovement } from '../types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { getTotalAnimalCapacity } from '../../actions/effects/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'E84_DollysMother'

export const E84_DollysMother = new MinorImprovement({
  id: CARD_ID,
  name: "Dolly's Mother",
  deck: "E",
  number: 84,
  desc: ["You only require 1 <SHEEP> to breed sheep during the breeding phase of a harvest. This card can hold 1 <SHEEP>."],
  cost: {},
  vp: 1,
  prerequisite: "1 Sheep",
})

export const E84_DollysMother_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (_state, player) => {
    // Only help if player has exactly 1 sheep (not enough for normal breeding which requires >= 2)
    if (player.resources.sheep !== 1) return
    // Check animal capacity — need room for the bred offspring
    const totalAnimals = (['sheep', 'boar', 'cattle'] as const).reduce(
      (sum, t) => sum + player.resources[t], 0,
    )
    if (totalAnimals >= getTotalAnimalCapacity(player)) return
    // Add virtual sheep so breedAnimals sees 2 and breeds
    player.resources.sheep += 1
    writeCardExtraData(player, CARD_ID, 'virtualSheepAdded', true)
  },
  onEndHarvest: (_state, player) => {
    if (!readCardExtraData<boolean>(player, CARD_ID, 'virtualSheepAdded')) return
    // Remove the virtual sheep that was temporarily added
    player.resources.sheep = Math.max(0, player.resources.sheep - 1)
    writeCardExtraData(player, CARD_ID, 'virtualSheepAdded', false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
