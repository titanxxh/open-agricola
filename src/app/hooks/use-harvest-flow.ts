import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import type { Locale } from '../../../shared/i18n'
import type { HarvestSummary } from '../../../shared/logic/round'
import { performHarvest } from '../../../shared/logic/round'
import { breedAnimals } from '../../../shared/actions/effects/breed-animals'
import { reap } from '../../../shared/actions/effects/reap'
import { emptyResources } from '../../../shared/logic/state'
import { formatResources } from '../../../shared/logic/format'
import { familySize, newbornCount } from '../../../shared/game/player'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../../../shared/cards/types'

export type HarvestFeedPending = {
  playerIndex: number
  playerName: string
  remaining: number
  foodUsed: number
}

export type HarvestFeedOption = {
  id: string
  sourceName: string
  resourceKey: keyof Resource
  food: number
  max?: number
  sourceId?: string
}

export type HarvestContext = {
  round: number
  reap: HarvestSummary['reap']
  feed: HarvestSummary['feed']
  pending: HarvestFeedPending[]
}

export const canFinalizeHarvest = (pendingFeedByPlayerId: Record<string, number>) =>
  Object.values(pendingFeedByPlayerId).every((value) => value <= 0)

export const runHarvestFlow = (state: GameState) => performHarvest(state)

export const applyReapPhase = (nextState: GameState) => {
  const summary: HarvestSummary['reap'] = []
  nextState.players.forEach((player) => {
    const beforeGrain = player.resources.grain
    const beforeVegetable = player.resources.vegetable
    reap(player)
    const grain = player.resources.grain - beforeGrain
    const vegetable = player.resources.vegetable - beforeVegetable
    if (grain > 0 || vegetable > 0) {
      summary.push({ player: player.name, grain, vegetable })
    }
  })
  return summary
}

export const applyBreedPhase = (nextState: GameState) => {
  const summary: HarvestSummary['breed'] = []
  nextState.players.forEach((player) => {
    const beforeSheep = player.resources.sheep
    const beforeBoar = player.resources.boar
    const beforeCattle = player.resources.cattle
    breedAnimals(player)
    const sheep = player.resources.sheep - beforeSheep
    const boar = player.resources.boar - beforeBoar
    const cattle = player.resources.cattle - beforeCattle
    if (sheep > 0 || boar > 0 || cattle > 0) {
      summary.push({ player: player.name, sheep, boar, cattle })
    }
  })
  return summary
}

export const buildHarvestLogEntries = (params: {
  locale: Locale
  context: HarvestContext
  breedSummary: HarvestSummary['breed']
  nextState: GameState
}) => {
  const { locale, context, breedSummary, nextState } = params
  const logEntries: GameState['log'] = []
  logEntries.push({ key: 'log.harvestPhaseReap' })
  context.reap.forEach((entry) => {
    const resources = formatResources(
      locale,
      {
        ...emptyResources,
        grain: entry.grain,
        vegetable: entry.vegetable,
      },
      true,
    )
    if (resources) {
      logEntries.push({
        key: 'log.harvestReapDetail',
        params: { player: entry.player, resources },
      })
    }
  })
  logEntries.push({ key: 'log.harvestPhaseFeed' })
  context.feed.forEach((entry) => {
    entry.conversions.forEach((conversion) => {
      const costResources = formatResources(
        locale,
        {
          ...emptyResources,
          [conversion.resourceKey]: conversion.count,
        },
        true,
      )
      const foodResources = formatResources(
        locale,
        {
          ...emptyResources,
          food: conversion.food,
        },
        true,
      )
      if (costResources && foodResources) {
        logEntries.push({
          key: 'log.harvestFeedConvert',
          params: {
            player: entry.player,
            source: conversion.sourceName,
            cost: costResources,
            food: foodResources,
          },
        })
      }
    })
    const resources = formatResources(
      locale,
      {
        ...emptyResources,
        food: entry.food,
        grain: entry.grain,
        vegetable: entry.vegetable,
        sheep: entry.sheep,
        boar: entry.boar,
        cattle: entry.cattle,
        begging: entry.begging,
      },
      true,
    )
    if (resources) {
      logEntries.push({
        key: 'log.harvestFeedDetail',
        params: { player: entry.player, resources },
      })
    }
  })
  logEntries.push({ key: 'log.harvestPhaseBreed' })
  breedSummary.forEach((entry) => {
    const resources = formatResources(
      locale,
      {
        ...emptyResources,
        sheep: entry.sheep,
        boar: entry.boar,
        cattle: entry.cattle,
      },
      true,
    )
    if (resources) {
      logEntries.push({
        key: 'log.harvestBreedDetail',
        params: { player: entry.player, resources },
      })
    }
  })
  logEntries.push({ key: 'log.harvest', params: { round: context.round } })
  for (let index = logEntries.length - 1; index >= 0; index -= 1) {
    const entry = logEntries[index]
    if (entry) {
      nextState.log.unshift(entry)
    }
  }
}

export const buildHarvestFeedOptions = (
  player: PlayerState,
  locale: Locale,
  cardLabel: (id: string) => string,
): HarvestFeedOption[] => {
  const options: HarvestFeedOption[] = []
  const addOption = (
    sourceName: string,
    resourceKey: keyof Resource,
    food: number,
    idSuffix: string,
  ) => {
    if (player.resources[resourceKey] <= 0) return
    options.push({
      id: `${idSuffix}-${resourceKey}-${food}`,
      sourceName,
      resourceKey,
      food,
    })
  }
  const basicSource =
    locale === 'zh' ? '基础转化' : 'Basic conversion'
  addOption(basicSource, 'grain', 1, 'basic')
  addOption(basicSource, 'vegetable', 1, 'basic')
  const cookingSources = [
    {
      id: 'Major_Fireplace1',
      vegetable: 2,
      sheep: 2,
      boar: 2,
      cattle: 3,
    },
    {
      id: 'Major_Fireplace2',
      vegetable: 2,
      sheep: 2,
      boar: 2,
      cattle: 3,
    },
    {
      id: 'Major_CookingHearth1',
      vegetable: 3,
      sheep: 2,
      boar: 3,
      cattle: 4,
    },
    {
      id: 'Major_CookingHearth2',
      vegetable: 3,
      sheep: 2,
      boar: 3,
      cattle: 4,
    },
  ]
  cookingSources.forEach((source) => {
    if (!player.improvements.includes(source.id)) return
    const sourceName = cardLabel(source.id)
    addOption(sourceName, 'vegetable', source.vegetable, source.id)
    addOption(sourceName, 'sheep', source.sheep, source.id)
    addOption(sourceName, 'boar', source.boar, source.id)
    addOption(sourceName, 'cattle', source.cattle, source.id)
  })
  // Harvest-trigger exchanges from played minors/occupations
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (!card?.exchanges) continue
    for (const ex of card.exchanges) {
      if (ex.trigger !== 'harvest') continue
      const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
      if (fromKeys.length !== 1) continue
      const fromKey = fromKeys[0]!
      const fromCount = (ex.from as Partial<Resource>)[fromKey] ?? 0
      const foodOut = (ex.to as Partial<Resource>).food ?? 0
      if (fromCount !== 1 || foodOut <= 0) continue
      if (player.resources[fromKey] <= 0) continue
      options.push({
        id: `${cardId}-harvest-${fromKey}-${foodOut}`,
        sourceName: cardLabel(cardId),
        resourceKey: fromKey,
        food: foodOut,
        max: ex.max,
        sourceId: cardId,
      })
    }
  }
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    if (!card?.exchanges) continue
    for (const ex of card.exchanges) {
      if (ex.trigger !== 'harvest') continue
      const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
      if (fromKeys.length !== 1) continue
      const fromKey = fromKeys[0]!
      const fromCount = (ex.from as Partial<Resource>)[fromKey] ?? 0
      const foodOut = (ex.to as Partial<Resource>).food ?? 0
      if (fromCount !== 1 || foodOut <= 0) continue
      if (player.resources[fromKey] <= 0) continue
      options.push({
        id: `${cardId}-harvest-${fromKey}-${foodOut}`,
        sourceName: cardLabel(cardId),
        resourceKey: fromKey,
        food: foodOut,
        max: ex.max,
        sourceId: cardId,
      })
    }
  }
  return options
}

export const startHarvestCore = (nextState: GameState) => {
  const reapSummary = applyReapPhase(nextState)
  const feedSummary: HarvestSummary['feed'] = []
  const pending: HarvestFeedPending[] = []
  nextState.players.forEach((player, index) => {
    const size = familySize(player)
    const newborns = newbornCount(player)
    const newbornPenalty = Math.min(newborns, size)
    let required = Math.max(0, size * 2 - newbornPenalty)
    const useFood = Math.min(player.resources.food, required)
    player.resources.food -= useFood
    required -= useFood
    if (required > 0) {
      const hasCookingSource = player.improvements.some(
        (id) =>
          id === 'Major_Fireplace1' ||
          id === 'Major_Fireplace2' ||
          id === 'Major_CookingHearth1' ||
          id === 'Major_CookingHearth2',
      )
      const hasHarvestExchange = (() => {
        for (const cardId of player.minorPlayed) {
          const card = getRegisteredMinorImprovement(cardId)
          if (!card?.exchanges) continue
          for (const ex of card.exchanges) {
            if (ex.trigger !== 'harvest') continue
            const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
            if (fromKeys.length !== 1) continue
            const fromKey = fromKeys[0]!
            if (player.resources[fromKey] > 0) return true
          }
        }
        for (const cardId of player.occupationPlayed) {
          const card = getRegisteredOccupation(cardId)
          if (!card?.exchanges) continue
          for (const ex of card.exchanges) {
            if (ex.trigger !== 'harvest') continue
            const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
            if (fromKeys.length !== 1) continue
            const fromKey = fromKeys[0]!
            if (player.resources[fromKey] > 0) return true
          }
        }
        return false
      })()
      const canConvert =
        player.resources.grain > 0 ||
        player.resources.vegetable > 0 ||
        (hasCookingSource &&
          (player.resources.sheep > 0 ||
            player.resources.boar > 0 ||
            player.resources.cattle > 0 ||
            player.resources.vegetable > 0)) ||
        hasHarvestExchange
      if (canConvert) {
        pending.push({
          playerIndex: index,
          playerName: player.name,
          remaining: required,
          foodUsed: useFood,
        })
      } else {
        player.resources.begging += required
        feedSummary.push({
          player: player.name,
          food: useFood,
          grain: 0,
          vegetable: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
          begging: required,
          conversions: [],
        })
      }
    } else if (useFood > 0) {
      feedSummary.push({
        player: player.name,
        food: useFood,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
        conversions: [],
      })
    }
  })
  const context: HarvestContext = {
    round: nextState.round,
    reap: reapSummary,
    feed: feedSummary,
    pending,
  }
  return { nextState, context }
}

export const confirmHarvestFeedCore = (params: {
  nextState: GameState
  context: HarvestContext
  countsOverride?: Record<string, number>
  harvestFeedCounts: Record<string, number>
  options: HarvestFeedOption[]
}) => {
  const { nextState, context, countsOverride, harvestFeedCounts, options } = params
  const current = context.pending[0]
  if (!current) return null
  const player = nextState.players[current.playerIndex]
  if (!player) return null
  const costTotals: Partial<Resource> = {}
  let foodFromConversions = 0
  const conversions: {
    sourceName: string
    resourceKey: keyof Resource
    count: number
    food: number
  }[] = []
  options.forEach((option) => {
    const count = countsOverride?.[option.id] ?? harvestFeedCounts[option.id] ?? 0
    if (count <= 0) return
    costTotals[option.resourceKey] = (costTotals[option.resourceKey] ?? 0) + count
    const food = count * option.food
    foodFromConversions += food
    conversions.push({
      sourceName: option.sourceName,
      resourceKey: option.resourceKey,
      count,
      food,
    })
  })
  Object.entries(costTotals).forEach(([key, value]) => {
    if (!value) return
    const resourceKey = key as keyof Resource
    player.resources[resourceKey] -= value
  })
  const remaining = Math.max(0, current.remaining - foodFromConversions)
  const extraFood = Math.max(0, foodFromConversions - current.remaining)
  if (extraFood > 0) {
    player.resources.food += extraFood
  }
  player.resources.begging += remaining
  const nextFeed = [
    ...context.feed,
    {
      player: current.playerName,
      food: current.foodUsed,
      grain: costTotals.grain ?? 0,
      vegetable: costTotals.vegetable ?? 0,
      sheep: costTotals.sheep ?? 0,
      boar: costTotals.boar ?? 0,
      cattle: costTotals.cattle ?? 0,
      begging: remaining,
      conversions,
    },
  ]
  const nextPending = context.pending.slice(1)
  return {
    nextState,
    nextContext: {
      ...context,
      feed: nextFeed,
      pending: nextPending,
    } as HarvestContext,
  }
}

export const findPendingAnimalPlayerIndex = (
  state: GameState,
  hasPendingAnimals: (player: PlayerState) => boolean,
) => state.players.findIndex((player) => hasPendingAnimals(player))
