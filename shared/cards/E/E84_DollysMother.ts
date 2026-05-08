import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'
import { E84_DollysMother } from '../../cards-display/E/E84_DollysMother'
export { E84_DollysMother }

const CARD_ID = E84_DollysMother.id

export const E84_DollysMother_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (state, player) => {
    // Only help if player has exactly 1 sheep (not enough for normal breeding which requires >= 2)
    if (player.resources.sheep !== 1) return
    // Check animal capacity — need room for the bred offspring
    const totalAnimals = (['sheep', 'boar', 'cattle'] as const).reduce(
      (sum, t) => sum + player.resources[t], 0,
    )
    const idx = state.players.indexOf(player)
    if (totalAnimals >= playerBoard(state, idx).animals.totalCapacity()) return
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
