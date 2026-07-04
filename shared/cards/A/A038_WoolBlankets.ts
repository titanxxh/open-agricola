import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'A038_WoolBlankets'
const countSheepOnBoard = (player: PlayerState): number => {
  let total = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'sheep') total += pasture.animalCount
  }
  if (player.houseAnimalType === 'sheep') total += player.houseAnimalCount
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal === 'sheep') total += 1
  }
  return total
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (player.houseType === 'wood') return 3
    if (player.houseType === 'clay') return 2
    return 0
  },
},
  prerequisiteCheck: (player) => countSheepOnBoard(player) >= 5,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A038_WoolBlankets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wool Blankets",
    deck: "A",
    number: 38,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, if you live in a wooden/<CLAY>/stone house by then, you get 3/2/0 bonus <SCORE>."],
    cost: {},
    prerequisite: "5 Sheep",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A038_WoolBlankets_impl = A038_WoolBlankets.impl
