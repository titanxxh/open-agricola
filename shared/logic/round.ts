import { applyMajorEffectsToAllPlayers } from '../cards/major'
import { breedAnimals } from '../actions/effects/breed-animals'
import { feedFamily } from '../actions/helpers/feed-family'
import { reap } from '../actions/effects/reap'
import type { GameState, Resource } from '../game/types'

type HarvestReapEntry = {
  player: string
  grain: number
  vegetable: number
}

type HarvestFeedEntry = {
  player: string
  food: number
  grain: number
  vegetable: number
  sheep: number
  boar: number
  cattle: number
  begging: number
  conversions: {
    sourceName: string
    resourceKey: keyof Resource
    count: number
    food: number
  }[]
}

type HarvestBreedEntry = {
  player: string
  sheep: number
  boar: number
  cattle: number
}

export type HarvestSummary = {
  reap: HarvestReapEntry[]
  feed: HarvestFeedEntry[]
  breed: HarvestBreedEntry[]
}

const snapshotResources = (resources: Resource): Resource => ({ ...resources })

export const performHarvest = (state: GameState): HarvestSummary => {
  const reapSummary: HarvestReapEntry[] = []
  const feedSummary: HarvestFeedEntry[] = []
  const breedSummary: HarvestBreedEntry[] = []

  state.players.forEach((player) => {
    const beforeReap = snapshotResources(player.resources)
    reap(state, player)
    const reapGrain = player.resources.grain - beforeReap.grain
    const reapVegetable = player.resources.vegetable - beforeReap.vegetable
    if (reapGrain > 0 || reapVegetable > 0) {
      reapSummary.push({
        player: player.name,
        grain: Math.max(0, reapGrain),
        vegetable: Math.max(0, reapVegetable),
      })
    }

    const beforeFeed = snapshotResources(player.resources)
    feedFamily(player)
    const feedFood = Math.max(0, beforeFeed.food - player.resources.food)
    const feedGrain = Math.max(0, beforeFeed.grain - player.resources.grain)
    const feedVegetable = Math.max(
      0,
      beforeFeed.vegetable - player.resources.vegetable,
    )
    const feedBegging = Math.max(0, player.resources.begging - beforeFeed.begging)
    if (feedFood > 0 || feedGrain > 0 || feedVegetable > 0 || feedBegging > 0) {
      feedSummary.push({
        player: player.name,
        food: feedFood,
        grain: feedGrain,
        vegetable: feedVegetable,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: feedBegging,
        conversions: [],
      })
    }

    const beforeBreed = snapshotResources(player.resources)
    breedAnimals(player)
    const breedSheep = player.resources.sheep - beforeBreed.sheep
    const breedBoar = player.resources.boar - beforeBreed.boar
    const breedCattle = player.resources.cattle - beforeBreed.cattle
    if (breedSheep > 0 || breedBoar > 0 || breedCattle > 0) {
      breedSummary.push({
        player: player.name,
        sheep: Math.max(0, breedSheep),
        boar: Math.max(0, breedBoar),
        cattle: Math.max(0, breedCattle),
      })
    }
  })

  applyMajorEffectsToAllPlayers(state, 'onHarvest')

  return {
    reap: reapSummary,
    feed: feedSummary,
    breed: breedSummary,
  }
}
