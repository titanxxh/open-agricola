import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import type { Locale } from '../../../shared/i18n'
import type { HarvestSummary } from '../../../shared/logic/round'
import { performHarvest } from '../../../shared/logic/round'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../../../shared/cards/types'
import { getMajorCard } from '../../../shared/cards/major'
import {
  BASIC_CONVERSION_SOURCE_ID,
  basicConversionExchanges,
} from '../../../shared/cards/basic-conversion'
import type { CardExchange } from '../../../shared/cards/types'

export type HarvestFeedPending = {
  playerIndex: number
  playerName: string
  remaining: number
  foodUsed: number
}

export type HarvestFeedOption = {
  id: string
  sourceName: string
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
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

const isHarvestFeedTrigger = (ex: CardExchange) => {
  const triggers = ex.triggers ?? []
  return triggers.includes('harvest') || triggers.includes('anytime')
}

const playerCanAfford = (player: PlayerState, ex: CardExchange) => {
  for (const [k, v] of Object.entries(ex.from)) {
    const need = (v as number) ?? 0
    if (need > 0 && player.resources[k as keyof Resource] < need) return false
  }
  return true
}

export const buildHarvestFeedOptions = (
  player: PlayerState,
  locale: Locale,
  cardLabel: (id: string) => string,
): HarvestFeedOption[] => {
  const options: HarvestFeedOption[] = []
  const basicSourceName = locale === 'zh' ? '基础转化' : 'Basic conversion'

  const pushFromExchanges = (
    sourceId: string,
    sourceName: string,
    exchanges: readonly CardExchange[] | undefined,
  ) => {
    if (!exchanges) return
    exchanges.forEach((ex, idx) => {
      if (!isHarvestFeedTrigger(ex)) return
      if (!playerCanAfford(player, ex)) return
      options.push({
        id: `${sourceId}-ex${idx}`,
        sourceName,
        sourceId,
        exchangeIndex: idx,
        from: { ...ex.from },
        to: { ...ex.to },
        max: ex.max,
      })
    })
  }

  // 1. Basic conversion (synthetic source)
  pushFromExchanges(BASIC_CONVERSION_SOURCE_ID, basicSourceName, basicConversionExchanges)

  // 2. Improvements (includes majors)
  for (const cardId of player.improvements) {
    const major = getMajorCard(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), major?.exchanges)
  }

  // 3. Minors
  for (const cardId of player.minorPlayed) {
    const card = getRegisteredMinorImprovement(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), card?.exchanges)
  }

  // 4. Occupations
  for (const cardId of player.occupationPlayed) {
    const card = getRegisteredOccupation(cardId)
    pushFromExchanges(cardId, cardLabel(cardId), card?.exchanges)
  }

  return options
}
