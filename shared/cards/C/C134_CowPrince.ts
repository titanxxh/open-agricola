import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C134_CowPrince'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      let count = 0
      count += player.pastures
        .filter((pasture) => pasture.animalType === 'cattle')
        .reduce((sum, pasture) => sum + Math.min(pasture.tiles.length, pasture.animalCount), 0)
      if (player.houseAnimalType === 'cattle') count += Math.min(player.rooms, player.houseAnimalCount)
      count += Object.values(player.stableAnimals ?? {}).filter((animal) => animal === 'cattle').length
      return count
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C134_CowPrince = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Cow Prince",
    deck: "C",
    number: 134,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each space in your farmyard (including rooms) holding at least 1 <CATTLE>."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C134_CowPrince_impl = C134_CowPrince.impl
