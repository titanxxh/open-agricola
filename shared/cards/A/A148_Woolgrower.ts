import type { CardImpl } from '../registry'
import { A148_Woolgrower } from '../../cards-display/A/A148_Woolgrower'

const CARD_ID = A148_Woolgrower.id

export const A148_Woolgrower_impl = {
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
        animalType: 'sheep',
        capacity: cap,
        animalCount: 0,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
