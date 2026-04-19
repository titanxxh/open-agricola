import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C89_StableMaster'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones) => {
    const stableZone = zones.find(z => z.zoneType === 'stable')
    if (stableZone) {
      stableZone.capacity += 2 // 1 → 3
    }
  },
})

export const C89_StableMaster = new Occupation({
  id: CARD_ID,
  name: 'Stable Master',
  deck: 'C',
  number: 89,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['When you play this card, you can immediately build exactly 1 stable for 1 <WOOD>. Exactly one of your unfenced stables can hold up to 3 animals of one type.'],
  cost: {},
  players: '1+',
})
