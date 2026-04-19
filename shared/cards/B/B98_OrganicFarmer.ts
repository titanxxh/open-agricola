import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { computeAnimalZones } from '../../actions/effects/animals'

const CARD_ID = 'B98_OrganicFarmer'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const zones = computeAnimalZones(player)
    return zones.filter((z) => z.zoneType === 'pasture' && (z.animalCount ?? 0) > 0 && z.capacity - (z.animalCount ?? 0) >= 3).length
  },
})

export const B98_OrganicFarmer = new Occupation({
  id: CARD_ID,
  name: "Organic Farmer",
  deck: "B",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ['During the scoring, you get 1 bonus <SCORE> for each pasture containing at least 1 animal while having unused capacity for at least three more animals.'],
  cost: {},
  players: "1+",
})
