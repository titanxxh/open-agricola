import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import { B86_TruffleSearcher } from '../../cards-display/B/B86_TruffleSearcher'
export { B86_TruffleSearcher }

const CARD_ID = B86_TruffleSearcher.id

export const B86_TruffleSearcher_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.completedHarvests = (counters.completedHarvests ?? 0) + 1
  },
  onComputeAnimalZones: (player, zones) => {
    const capacity = player.cardStates?.[CARD_ID]?.counters?.completedHarvests ?? 0
    if (capacity <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity,
      animalType: 'boar',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
