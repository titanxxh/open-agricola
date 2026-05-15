import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import { A148_Woolgrower } from '../../cards-display/A/A148_Woolgrower'

const CARD_ID = A148_Woolgrower.id

export const A148_Woolgrower_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.completedHarvests = (counters.completedHarvests ?? 0) + 1
  },
  onComputeAnimalZones: (player, zones, _state) => {
    const capacity = player.cardStates?.[CARD_ID]?.counters?.completedHarvests ?? 0
    if (capacity <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity,
      animalType: 'sheep',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
