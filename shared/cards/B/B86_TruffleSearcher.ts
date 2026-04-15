import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { initCardState } from '../__stubs__/helpers'

const CARD_ID = 'B86_TruffleSearcher'

/**
 * B86 Truffle Searcher — This card can hold a number of <PIG> equal to the
 * number of completed feeding phases.
 *
 * BGA: Globals::getCompletedFeedingPhases() — same pattern as A148_Woolgrower.
 */
registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    counters.completedHarvests = (counters.completedHarvests ?? 0) + 1
  },
  onComputeAnimalZones: (player, zones) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const B86_TruffleSearcher = new Occupation({
  id: CARD_ID,
  name: 'Truffle Searcher',
  deck: 'B',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['This card can hold a number of <PIG> equal to the number of completed feeding phases.'],
  cost: {},
  players: '1+',
  newSet: true,
})
