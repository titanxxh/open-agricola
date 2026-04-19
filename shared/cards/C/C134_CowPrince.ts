import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C134_CowPrince'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    let count = 0
    count += player.pastures.filter((p) => p.animalType === 'cattle' && p.animalCount > 0).length
    if (player.houseAnimalType === 'cattle' && player.houseAnimalCount > 0) count += 1
    count += Object.values(player.stableAnimals ?? {}).filter((t) => t === 'cattle').length
    return count
  },
})

export const C134_CowPrince = new Occupation({
  id: CARD_ID,
  name: "Cow Prince",
  deck: "C",
  number: 134,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each space in your farmyard (including rooms) holding at least 1 <CATTLE>."],
  cost: {},
  players: "1+",
})
