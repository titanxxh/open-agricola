import { useCallback, useMemo, useState } from 'react'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import type { Locale } from '../../shared/i18n'
import type { CardMeta } from '../services/card-meta'
import {
  buildAnytimeExchangeBulkChoice,
  buildAnytimeExchangeOptions,
  type AnytimeExchangeOption,
} from './anytime-exchange-ui'
import {
  buildBakeBulkChoice,
  buildBakeExchangeInfo,
  hasSelectedBakeGrain,
} from './bake-exchange-ui'
import {
  buildHarvestFeedOptions,
  type HarvestFeedOption,
} from './hooks/use-harvest-flow'
import { computeHarvestFeedCounterMax } from './hooks/use-harvest-feed-counter'
import type { InteractionFeedSelection, InteractionPresentationPlan } from './interaction-presentation'
import type { PendingChoice } from '../types/ui'

type ExchangeDraftState = {
  players: PlayerState[]
} | null | undefined

type ExchangeDraftInput = {
  state: ExchangeDraftState
  pendingChoice: PendingChoice | null
  interactionPresentationPlan: InteractionPresentationPlan
  locale: Locale
  cardLabel: (id: string) => string
  getCardMeta: (id: string) => Pick<CardMeta, 'exchanges'> | undefined
}

const activeCountsFor = (
  ids: readonly string[],
  counts: Record<string, number>,
): Record<string, number> => {
  const active: Record<string, number> = {}
  ids.forEach((id) => {
    active[id] = counts[id] ?? 0
  })
  return active
}

const hasAnyResource = (resources: Resource): boolean =>
  Object.values(resources).some((value) => value > 0)

const buildAnytimeExchangeSummary = (
  selections: readonly { count: number; from: Partial<Resource>; to: Partial<Resource> }[],
): Resource => {
  const resources = { ...emptyResources }
  selections.forEach((entry) => {
    Object.entries(entry.from ?? {}).forEach(([k, v]) => {
      const key = k as keyof Resource
      resources[key] = (resources[key] ?? 0) + entry.count * ((v as number) ?? 0)
    })
    Object.entries(entry.to ?? {}).forEach(([k, v]) => {
      const key = k as keyof Resource
      resources[key] = (resources[key] ?? 0) + entry.count * ((v as number) ?? 0)
    })
  })
  return resources
}

const buildHarvestFeedSummary = ({
  selections,
  foodUsed,
  convertedFood,
  begging,
}: {
  selections: readonly { count: number; from: Partial<Resource> }[]
  foodUsed: number
  convertedFood: number
  begging: number
}): Resource => {
  const resources = { ...emptyResources }
  resources.food = foodUsed + convertedFood
  selections.forEach((entry) => {
    Object.entries(entry.from ?? {}).forEach(([k, v]) => {
      const key = k as keyof Resource
      resources[key] = (resources[key] ?? 0) + entry.count * ((v as number) ?? 0)
    })
  })
  resources.begging = begging
  return resources
}

export const useExchangeDraftPresentation = ({
  state,
  pendingChoice,
  interactionPresentationPlan,
  locale,
  cardLabel,
  getCardMeta,
}: ExchangeDraftInput) => {
  const [bakeExchangeCounts, setBakeExchangeCounts] = useState<Record<string, number>>({})
  const [harvestFeedCounts, setHarvestFeedCounts] = useState<Record<string, number>>({})
  const [anytimeExchangeCounts, setAnytimeExchangeCounts] = useState<Record<string, number>>({})

  const isBakeExchange = pendingChoice?.promptKey === 'ui.interactionBakeBreadChoice'
  const bakeExchangeSourceIds = useMemo(
    () =>
      isBakeExchange
        ? (pendingChoice?.options ?? []).map((option) => option.value)
        : [],
    [isBakeExchange, pendingChoice?.options],
  )
  const bakeExchangeInfo = useMemo(
    () => buildBakeExchangeInfo(bakeExchangeSourceIds, getCardMeta),
    [bakeExchangeSourceIds, getCardMeta],
  )
  const bakeExchangePlayer =
    isBakeExchange && pendingChoice && state
      ? state.players[pendingChoice.playerIndex]
      : null
  const bakeExchangeOptions = useMemo(
    () =>
      isBakeExchange
        ? (pendingChoice?.options ?? []).filter(
            (option) => !!bakeExchangeInfo[option.value],
          )
        : [],
    [bakeExchangeInfo, isBakeExchange, pendingChoice?.options],
  )
  const bakeExchangeOptionIds = useMemo(
    () => bakeExchangeOptions.map((option) => option.value),
    [bakeExchangeOptions],
  )
  const activeBakeExchangeCounts = useMemo(
    () => activeCountsFor(bakeExchangeOptionIds, bakeExchangeCounts),
    [bakeExchangeCounts, bakeExchangeOptionIds],
  )
  const bakeTotalGrain = Object.values(activeBakeExchangeCounts).reduce(
    (sum, value) => sum + value,
    0,
  )
  const bakeTotalFood = Object.entries(activeBakeExchangeCounts).reduce(
    (sum, [id, count]) =>
      sum + (bakeExchangeInfo[id]?.food ?? 0) * count,
    0,
  )
  const bakeBaseFood = bakeExchangePlayer?.resources.food ?? 0
  const bakeBaseGrain = bakeExchangePlayer?.resources.grain ?? 0
  const bakeSummary = {
    ...emptyResources,
    food: bakeBaseFood + bakeTotalFood,
    grain: Math.max(0, bakeBaseGrain - bakeTotalGrain),
  }
  const bakeLimitById = useMemo(() => {
    const limits: Record<string, number> = {}
    bakeExchangeOptions.forEach((option) => {
      const current = activeBakeExchangeCounts[option.value] ?? 0
      const availableGrain = bakeExchangePlayer?.resources.grain ?? 0
      const remaining = Math.max(0, availableGrain - bakeTotalGrain)
      limits[option.value] = Math.min(bakeExchangeInfo[option.value]?.max ?? 0, current + remaining)
    })
    return limits
  }, [activeBakeExchangeCounts, bakeExchangeInfo, bakeExchangeOptions, bakeExchangePlayer?.resources, bakeTotalGrain])
  const updateBakeExchangeCount = useCallback((id: string, delta: number) => {
    if (!bakeExchangePlayer) return
    setBakeExchangeCounts((prev) => {
      const current = prev[id] ?? 0
      const maxUse = bakeExchangeInfo[id]?.max ?? 0
      const totalSelected = bakeExchangeOptionIds.reduce(
        (sum, optionId) => sum + (prev[optionId] ?? 0),
        0,
      )
      const availableGrain = bakeExchangePlayer.resources.grain
      const remaining = Math.max(0, availableGrain - totalSelected)
      const limit = Math.min(maxUse, current + remaining)
      const nextValue = Math.max(0, Math.min(current + delta, limit))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }, [bakeExchangeInfo, bakeExchangeOptionIds, bakeExchangePlayer])
  const resetBakeExchangeCounts = useCallback(() => {
    const nextCounts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setBakeExchangeCounts(nextCounts)
  }, [bakeExchangeOptionIds])

  const isAnytimeExchange = pendingChoice?.promptKey === 'ui.interactionExchangeChoice'
  const anytimeExchangePlayer =
    isAnytimeExchange && pendingChoice && state
      ? state.players[pendingChoice.playerIndex] ?? null
      : null
  const anytimeExchangeOptions = useMemo(
    () =>
      isAnytimeExchange && pendingChoice && anytimeExchangePlayer
        ? buildAnytimeExchangeOptions(
            anytimeExchangePlayer,
            pendingChoice.options,
            cardLabel,
            getCardMeta,
          )
        : [],
    [anytimeExchangePlayer, cardLabel, getCardMeta, isAnytimeExchange, pendingChoice],
  )
  const anytimeExchangeOptionIds = useMemo(
    () => anytimeExchangeOptions.map((option) => option.id),
    [anytimeExchangeOptions],
  )
  const activeAnytimeExchangeCounts = useMemo(
    () => activeCountsFor(anytimeExchangeOptionIds, anytimeExchangeCounts),
    [anytimeExchangeCounts, anytimeExchangeOptionIds],
  )
  const anytimeLimitById = useMemo(() => {
    const limits: Record<string, number> = {}
    anytimeExchangeOptions.forEach((option) => {
      limits[option.id] = option.tradeIndex === undefined || !anytimeExchangePlayer
        ? 0
        : Math.min(
            option.maxTimes,
            computeHarvestFeedCounterMax(
              option,
              anytimeExchangeOptions,
              activeAnytimeExchangeCounts,
              anytimeExchangePlayer.resources,
            ),
          )
    })
    return limits
  }, [activeAnytimeExchangeCounts, anytimeExchangeOptions, anytimeExchangePlayer])
  const updateAnytimeExchangeCount = useCallback((id: string, delta: number) => {
    setAnytimeExchangeCounts((prev) => {
      const currentCounts = activeCountsFor(anytimeExchangeOptionIds, prev)
      const current = currentCounts[id] ?? 0
      const option = anytimeExchangeOptions.find((entry) => entry.id === id)
      if (!option || !anytimeExchangePlayer || option.tradeIndex === undefined) return prev
      const max = Math.min(
        option.maxTimes,
        computeHarvestFeedCounterMax(
          option,
          anytimeExchangeOptions,
          currentCounts,
          anytimeExchangePlayer.resources,
        ),
      )
      const nextValue = Math.max(0, Math.min(current + delta, max))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }, [anytimeExchangeOptionIds, anytimeExchangeOptions, anytimeExchangePlayer])
  const anytimeExchangeSelections = useMemo(
    () =>
      anytimeExchangeOptions
        .map((option) => ({
          count: activeAnytimeExchangeCounts[option.id] ?? 0,
          from: option.from,
          to: option.to,
        }))
        .filter((entry) => entry.count > 0),
    [activeAnytimeExchangeCounts, anytimeExchangeOptions],
  )
  const anytimeExchangeSummary = useMemo(
    () => buildAnytimeExchangeSummary(anytimeExchangeSelections),
    [anytimeExchangeSelections],
  )

  const isHarvestFeedExchange = interactionPresentationPlan.kind === 'harvest-feed'
  const harvestFeedPlayer =
    isHarvestFeedExchange && state && interactionPresentationPlan.kind === 'harvest-feed'
      ? state.players[interactionPresentationPlan.playerIndex] ?? null
      : null
  const harvestFeedOptions = useMemo(
    () =>
      harvestFeedPlayer
        ? buildHarvestFeedOptions(harvestFeedPlayer, locale, cardLabel)
        : [],
    [harvestFeedPlayer, locale, cardLabel],
  )
  const harvestFeedOptionIds = useMemo(
    () => harvestFeedOptions.map((option) => option.id),
    [harvestFeedOptions],
  )
  const activeHarvestFeedCounts = useMemo(
    () => activeCountsFor(harvestFeedOptionIds, harvestFeedCounts),
    [harvestFeedCounts, harvestFeedOptionIds],
  )
  const harvestFeedLimitById = useMemo(() => {
    const limits: Record<string, number> = {}
    harvestFeedOptions.forEach((option) => {
      limits[option.id] = harvestFeedPlayer
        ? computeHarvestFeedCounterMax(
            option,
            harvestFeedOptions,
            activeHarvestFeedCounts,
            harvestFeedPlayer.resources,
          )
        : 0
    })
    return limits
  }, [activeHarvestFeedCounts, harvestFeedOptions, harvestFeedPlayer])
  const updateHarvestFeedCount = useCallback((id: string, delta: number) => {
    setHarvestFeedCounts((prev) => {
      const currentCounts = activeCountsFor(harvestFeedOptionIds, prev)
      const current = currentCounts[id] ?? 0
      const option = harvestFeedOptions.find((entry) => entry.id === id)
      if (!option || !harvestFeedPlayer) return prev
      const max = computeHarvestFeedCounterMax(
        option,
        harvestFeedOptions,
        currentCounts,
        harvestFeedPlayer.resources,
      )
      const nextValue = Math.max(0, Math.min(current + delta, max))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }, [harvestFeedOptionIds, harvestFeedOptions, harvestFeedPlayer])
  const resetHarvestFeedCounts = useCallback(() => {
    const nextCounts: Record<string, number> = {}
    harvestFeedOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setHarvestFeedCounts(nextCounts)
  }, [harvestFeedOptionIds])
  const harvestFeedSelections = useMemo(
    () =>
      harvestFeedOptions
        .map((option) => ({
          count: activeHarvestFeedCounts[option.id] ?? 0,
          sourceName: option.sourceName,
          sourceId: option.sourceId,
          exchangeIndex: option.exchangeIndex,
          from: option.from,
          to: option.to,
        }))
        .filter((entry) => entry.count > 0),
    [activeHarvestFeedCounts, harvestFeedOptions],
  )
  const harvestFeedConvertedFood = useMemo(
    () =>
      harvestFeedSelections.reduce(
        (sum, entry) => sum + entry.count * ((entry.to.food as number) ?? 0),
        0,
      ),
    [harvestFeedSelections],
  )
  const harvestPending = interactionPresentationPlan.kind === 'harvest-feed'
    ? interactionPresentationPlan
    : null
  const harvestFeedBegging = Math.max(
    0,
    (harvestPending?.remaining ?? 0) - harvestFeedConvertedFood,
  )
  const harvestFeedSummary = useMemo(
    () => buildHarvestFeedSummary({
      selections: harvestFeedSelections,
      foodUsed: harvestPending?.foodUsed ?? 0,
      convertedFood: harvestFeedConvertedFood,
      begging: harvestFeedBegging,
    }),
    [harvestFeedBegging, harvestFeedConvertedFood, harvestFeedSelections, harvestPending?.foodUsed],
  )

  const reset = useCallback(() => {
    setBakeExchangeCounts({})
    setAnytimeExchangeCounts({})
    setHarvestFeedCounts({})
  }, [])

  return {
    reset,
    bake: {
      isActive: isBakeExchange,
      player: bakeExchangePlayer,
      info: bakeExchangeInfo,
      options: bakeExchangeOptions,
      counts: activeBakeExchangeCounts,
      limitById: bakeLimitById,
      totalGrain: bakeTotalGrain,
      summary: bakeSummary,
      hasSelection: hasSelectedBakeGrain(activeBakeExchangeCounts),
      hasSummary: bakeSummary.food > 0 || bakeSummary.grain > 0,
      choice: buildBakeBulkChoice(activeBakeExchangeCounts),
      updateCount: updateBakeExchangeCount,
      reset: resetBakeExchangeCounts,
    },
    anytime: {
      isActive: isAnytimeExchange,
      player: anytimeExchangePlayer,
      options: anytimeExchangeOptions as AnytimeExchangeOption[],
      counts: activeAnytimeExchangeCounts,
      limitById: anytimeLimitById,
      selections: anytimeExchangeSelections,
      summary: anytimeExchangeSummary,
      hasSelection: Object.values(activeAnytimeExchangeCounts).some((value) => value > 0),
      hasSummary: hasAnyResource(anytimeExchangeSummary),
      choice: buildAnytimeExchangeBulkChoice(activeAnytimeExchangeCounts, anytimeExchangeOptions),
      updateCount: updateAnytimeExchangeCount,
    },
    harvestFeed: {
      isActive: isHarvestFeedExchange,
      player: harvestFeedPlayer,
      options: harvestFeedOptions as HarvestFeedOption[],
      counts: activeHarvestFeedCounts,
      limitById: harvestFeedLimitById,
      selections: harvestFeedSelections as InteractionFeedSelection[],
      convertedFood: harvestFeedConvertedFood,
      begging: harvestFeedBegging,
      summary: harvestFeedSummary,
      hasSummary: hasAnyResource(harvestFeedSummary),
      updateCount: updateHarvestFeedCount,
      reset: resetHarvestFeedCounts,
    },
  }
}
