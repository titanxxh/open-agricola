import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D86_SheepAgent'

/**
 * D86 Sheep Agent — You can keep 1 <SHEEP> on this card for each occupation
 * card in front of you (including this one), unless it is already able to hold animals.
 *
 * BGA: capacity = countOccupations, then subtract 1 for each of the other
 * animalHolder occupations already played: A148, B86, B148, C86.
 */
const OTHER_ANIMAL_HOLDER_OCCUPATIONS = [
  'A148_Woolgrower',
  'B86_TruffleSearcher',
  'B148_PetBroker',
  'C86_LivestockFeeder',
]

export const D86_SheepAgent = new Occupation({
  id: CARD_ID,
  name: 'Sheep Agent',
  deck: 'D',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['You can keep 1 <SHEEP> on this card for each occupation card in front of you (including this one), unless it is already able to hold animals.'],
  cost: {},
  players: '1+',
})

export const D86_SheepAgent_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    let capacity = player.occupationPlayed.length
    for (const otherId of OTHER_ANIMAL_HOLDER_OCCUPATIONS) {
      if (player.occupationPlayed.includes(otherId)) {
        capacity -= 1
      }
    }
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
