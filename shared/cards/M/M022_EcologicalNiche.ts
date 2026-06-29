import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countTerrain, hasGrowingCrop } from './moor-batch1-helpers'
import type { PlayerState } from '../../contract/types'
import type { AnimalKey } from '../../contract/animals'

const CARD_ID = 'M022_EcologicalNiche'
const ANIMALS: readonly AnimalKey[] = ['sheep', 'boar', 'cattle', 'horse']

const hasAnimal = (player: PlayerState, animal: AnimalKey) =>
  (player.resources[animal] ?? 0) > 0

const hasUniqueAnimal = (statePlayers: readonly PlayerState[], player: PlayerState) =>
  ANIMALS.some((animal) =>
    hasAnimal(player, animal) && statePlayers.every((other) => other.id === player.id || !hasAnimal(other, animal)),
  )

const isOnlyGrowing = (
  statePlayers: readonly PlayerState[],
  player: PlayerState,
  crop: 'grain' | 'vegetable',
) =>
  hasGrowingCrop(player, crop) &&
  statePlayers.every((other) => other.id === player.id || !hasGrowingCrop(other, crop))

const hasSingleMostTerrain = (
  statePlayers: readonly PlayerState[],
  player: PlayerState,
  kind: 'forest' | 'moor',
) => {
  const own = countTerrain(player, kind)
  return own > 0 && statePlayers.every((other) => other.id === player.id || countTerrain(other, kind) < own)
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      let food = 0
      let fuel = 0
      if (hasUniqueAnimal(state.players, player)) food += 2
      if (isOnlyGrowing(state.players, player, 'grain')) food += 1
      if (isOnlyGrowing(state.players, player, 'vegetable')) food += 1
      if (hasSingleMostTerrain(state.players, player, 'forest')) fuel += 1
      if (hasSingleMostTerrain(state.players, player, 'moor')) fuel += 1
      if (food === 0 && fuel === 0) return
      return gainLeaf(CARD_ID, { food, fuel })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M022_EcologicalNiche = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Ecological Niche",
    deck: "M",
    number: 22,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 2 <FOOD> if you have an animal type that no one else has; 1 <FOOD> each if only you are growing grain and/or vegetables; 1 <FUEL> each if you have the single most forests and/or moors."
    ],
    cost: {},
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M022_EcologicalNiche_impl = M022_EcologicalNiche.impl
