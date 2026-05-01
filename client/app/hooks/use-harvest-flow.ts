import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import type { Locale } from '../../../shared/i18n'
import type { HarvestSummary } from '../../../shared/logic/round'
import { performHarvest } from '../../../shared/logic/round'
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
  /**
   * Legacy single-resource forward-trade fields. Kept for back-compat with
   * the basic conversion + Major Fireplace prompt path.
   */
  resourceKey: keyof Resource
  food: number
  max?: number
  sourceId?: string
  /**
   * Sprint 6a entry-index pointer (preferred when present). When set, the
   * server applies the exchange bidirectionally — supporting reverse trades
   * (food -> resources, e.g. C105) and multi-key conversions.
   */
  exchangeIndex?: number
  /** Full from/to maps for prompt rendering of multi-key trades. */
  from?: Partial<Resource>
  to?: Partial<Resource>
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
  // Harvest-trigger exchanges from played minors/occupations.
  // Sprint 6a: surface every harvest-window exchange as an entry-index
  // pointer so the server can apply it bidirectionally (forward + reverse).
  // Legacy single-key forward trades still populate `resourceKey`/`food` for
  // back-compat with prompts that read those fields.
  const addExchangeOption = (
    cardId: string,
    ex: import('../../../shared/cards/types').CardExchange,
    idx: number,
  ) => {
    const fromKeys = Object.keys(ex.from) as (keyof Resource)[]
    // Affordability gate: every `from` resource must be present (>=1 unit).
    for (const k of fromKeys) {
      const need = (ex.from as Partial<Resource>)[k] ?? 0
      if (need > 0 && player.resources[k] < need) return
    }
    // Legacy compat: report `resourceKey`/`food` only for single-input,
    // food-output trades. Reverse / multi-key trades still attach the
    // entry-index pointer; the server prefers it when present.
    let resourceKey: keyof Resource = (fromKeys[0] ?? 'food') as keyof Resource
    let food = 0
    if (fromKeys.length === 1) {
      const k = fromKeys[0]!
      const fromCount = (ex.from as Partial<Resource>)[k] ?? 0
      const foodOut = (ex.to as Partial<Resource>).food ?? 0
      if (fromCount === 1 && foodOut > 0) {
        resourceKey = k
        food = foodOut
      }
    }
    options.push({
      id: `${cardId}-harvest-ex${idx}`,
      sourceName: cardLabel(cardId),
      resourceKey,
      food,
      max: ex.max,
      sourceId: cardId,
      exchangeIndex: idx,
      from: { ...ex.from },
      to: { ...ex.to },
    })
  }
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    if (!card?.exchanges) continue
    card.exchanges.forEach((ex, idx) => {
      if (!(ex.triggers ?? []).includes('harvest')) return
      addExchangeOption(cardId, ex, idx)
    })
  }
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    if (!card?.exchanges) continue
    card.exchanges.forEach((ex, idx) => {
      if (!(ex.triggers ?? []).includes('harvest')) return
      addExchangeOption(cardId, ex, idx)
    })
  }
  return options
}

