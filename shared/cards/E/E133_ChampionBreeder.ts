import type { CardImpl } from '../registry'
import { E133_ChampionBreeder } from '../../cards-display/E/E133_ChampionBreeder'

const CARD_ID = E133_ChampionBreeder.id

export const E133_ChampionBreeder_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    const summary = state.harvestBreedSummary?.[player.id]
    if (!summary) return
    const { animalCount } = summary
    if (animalCount >= 3) {
      return {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    }
    if (animalCount >= 2) {
      return { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID }
    }
    return undefined
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
