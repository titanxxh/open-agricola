import type { CardImpl } from '../registry'
import { B86_TruffleSearcher } from '../../cards-display/B/B86_TruffleSearcher'

const CARD_ID = B86_TruffleSearcher.id

export const B86_TruffleSearcher_impl = {
  listeners: [],
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (_player, zones, state) => {
      const cap = state.completedFeedingPhases
      if (cap <= 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        animalType: 'boar',
        capacity: cap,
        animalCount: 0,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
