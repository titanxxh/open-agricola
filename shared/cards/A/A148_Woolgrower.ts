import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { initCardState } from '../__stubs__/helpers'

const CARD_ID = 'A148_Woolgrower'

/**
 * A148 Woolgrower — This card can hold a number of <SHEEP> equal to the number
 * of completed feeding phases.
 *
 * BGA: Globals::getCompletedFeedingPhases() — incremented each feeding phase.
 * We track this via onHarvestFeedingPhase, and read it in onComputeAnimalZones.
 */
registerCardEffect({
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
      animalType: 'sheep',
      animalCount: 0,
    })
  },
})

export const A148_Woolgrower = new Occupation({
  id: CARD_ID,
  name: 'Woolgrower',
  deck: 'A',
  number: 148,
  category: 'FARM_PLANNER',
  desc: ['This card can hold a number of <SHEEP> equal to the number of completed feeding phases.'],
  cost: {},
  players: '4+',
  newSet: true,
})
