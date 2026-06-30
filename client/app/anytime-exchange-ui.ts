import type { ActionChoiceOption, PlayerState, Resource } from '../../shared/contract/types'
import type { CardExchange } from '../../shared/contract/cards'
import type { CardMeta } from '../services/card-meta'

export type AnytimeExchangeOption = {
  id: string
  sourceName: string
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  maxTimes: number
  tradeIndex?: number
}

type ParsedTradeChoice = {
  option: ActionChoiceOption
  tradeIndex: number
  maxTimes: number
}

const parseTradeChoice = (option: ActionChoiceOption): ParsedTradeChoice | undefined => {
  const match = option.value.match(/^trade:(\d+):(.+)$/)
  if (!match) return undefined
  const tradeIndex = Number(match[1])
  const maxTimes = Number(match[2])
  if (!Number.isFinite(tradeIndex) || tradeIndex < 0) return undefined
  if (!Number.isFinite(maxTimes) || maxTimes <= 0) return undefined
  return { option, tradeIndex, maxTimes }
}

const resourceValue = (resources: Record<string, number | undefined> | undefined, key: string) =>
  resources?.[key] ?? 0

const matchesScaledResources = (
  scaled: Record<string, number | undefined> | undefined,
  base: Partial<Resource>,
  times: number,
) => {
  const keys = new Set([...Object.keys(scaled ?? {}), ...Object.keys(base)])
  for (const key of keys) {
    if (resourceValue(scaled, key) !== resourceValue(base as Record<string, number | undefined>, key) * times) {
      return false
    }
  }
  return true
}

const matchesExchange = (
  choice: ParsedTradeChoice,
  sourceId: string,
  exchange: CardExchange,
) => {
  const preview = choice.option.effectPreview
  return (
    choice.option.sourceCard === sourceId &&
    preview?.kind === 'resourceExchange' &&
    matchesScaledResources(preview.resourcesPaid, exchange.from, choice.maxTimes) &&
    matchesScaledResources(preview.resourcesGained, exchange.to, choice.maxTimes)
  )
}

const divideResources = (
  resources: Record<string, number | undefined> | undefined,
  times: number,
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  if (!resources || times <= 0) return out
  Object.entries(resources).forEach(([key, value]) => {
    if ((value ?? 0) <= 0) return
    out[key as keyof Resource] = (value ?? 0) / times
  })
  return out
}

export const buildAnytimeExchangeOptions = (
  player: PlayerState,
  serverOptions: readonly ActionChoiceOption[],
  cardLabel: (id: string) => string,
  getMeta: (id: string) => Pick<CardMeta, 'exchanges'> | undefined,
): AnytimeExchangeOption[] => {
  const parsedChoices = serverOptions
    .map(parseTradeChoice)
    .filter((entry): entry is ParsedTradeChoice => !!entry)
  const usedChoiceValues = new Set<string>()
  const out: AnytimeExchangeOption[] = []

  const pushCard = (cardId: string) => {
    const exchanges = getMeta(cardId)?.exchanges
    if (!exchanges) return
    exchanges.forEach((exchange, exchangeIndex) => {
      if (!(exchange.triggers ?? []).includes('anytime')) return
      const sourceId = exchange.sourceId ?? cardId
      const choice = parsedChoices.find((candidate) =>
        !usedChoiceValues.has(candidate.option.value) &&
        matchesExchange(candidate, sourceId, exchange),
      )
      if (choice) usedChoiceValues.add(choice.option.value)
      out.push({
        id: `${sourceId}-ex${exchangeIndex}`,
        sourceName: cardLabel(cardId),
        sourceId,
        exchangeIndex,
        from: { ...exchange.from },
        to: { ...exchange.to },
        max: exchange.max,
        maxTimes: choice ? Math.min(choice.maxTimes, exchange.max ?? Number.POSITIVE_INFINITY) : 0,
        tradeIndex: choice?.tradeIndex,
      })
    })
  }

  player.improvements.forEach(pushCard)
  player.minorPlayed.forEach(pushCard)
  player.occupationPlayed.forEach(pushCard)

  parsedChoices.forEach((choice) => {
    if (usedChoiceValues.has(choice.option.value)) return
    const preview = choice.option.effectPreview
    if (preview?.kind !== 'resourceExchange' || !choice.option.sourceCard) return
    out.push({
      id: `${choice.option.sourceCard}-trade${choice.tradeIndex}`,
      sourceName: cardLabel(choice.option.sourceCard),
      sourceId: choice.option.sourceCard,
      exchangeIndex: choice.tradeIndex,
      from: divideResources(preview.resourcesPaid, choice.maxTimes),
      to: divideResources(preview.resourcesGained, choice.maxTimes),
      maxTimes: choice.maxTimes,
      tradeIndex: choice.tradeIndex,
    })
  })

  return out
}

export const buildAnytimeExchangeBulkChoice = (
  counts: Record<string, number>,
  options: readonly Pick<AnytimeExchangeOption, 'id' | 'tradeIndex'>[],
) => {
  const entries = options
    .map((option) => {
      const count = counts[option.id] ?? 0
      return count > 0 && option.tradeIndex !== undefined
        ? `${option.tradeIndex}=${count}`
        : null
    })
    .filter((entry): entry is string => entry !== null)

  return entries.length > 0 ? `bulk:${entries.join(',')}` : null
}
