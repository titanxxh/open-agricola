import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'
import { A38_WoolBlankets } from '../../cards-display/A/A38_WoolBlankets'
export { A38_WoolBlankets }

const CARD_ID = A38_WoolBlankets.id

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

registerPrerequisite('5 Sheep', (player) => countSheepOnBoard(player) >= 5)

export const A38_WoolBlankets_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (player.houseType === 'wood') return 3
    if (player.houseType === 'clay') return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
