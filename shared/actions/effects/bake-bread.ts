import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  ImmediateLogEntry,
  PlayerState,
} from '../../contract/types'
import { getPlayerBakeRates } from '../../cards/helpers/exchange-registry'
import { addFoodFromConversion, incResourceConverted } from '../../session/stats'

type BakeRate = ReturnType<typeof getPlayerBakeRates>[number]

type BakePlanEntry = {
  cardId: string
  count: number
}

const failInvalidBake = (): ActionExecutionResult => ({
  type: 'fail',
  logKey: 'log.action',
  recoverable: true,
})

const canBakeBreadDirectly = (player: PlayerState): boolean =>
  player.resources.grain > 0 && getPlayerBakeRates(player).length > 0

export const canBakeBread = (player: PlayerState, cardId: string): boolean => {
  const rates = getPlayerBakeRates(player)
  return player.resources.grain > 0 && rates.some((r) => r.cardId === cardId)
}

export const bakeBread = (
  player: PlayerState,
  cardId: string,
  times = 1,
): ActionExecutionResult => {
  const rates = getPlayerBakeRates(player)
  const rate = rates.find((r) => r.cardId === cardId)
  if (!rate || player.resources.grain <= 0) return { type: 'ok' }
  const bakeTimes = Math.max(0, Math.min(player.resources.grain, times))
  if (bakeTimes === 0) return { type: 'ok' }
  const foodGained = rate.rate * bakeTimes
  player.resources.grain -= bakeTimes
  player.resources.food += foodGained
  incResourceConverted(player, 'grain', bakeTimes)
  addFoodFromConversion(player, 'grain', foodGained)
  return {
    type: 'ok',
    immediateLogs: [
      {
        key: 'log.bakeBread',
        params: { count: bakeTimes, food: foodGained },
      },
    ],
  }
}

const buildBakeBreadOptions = (player: PlayerState): ActionChoiceOption[] => {
  const rates = getPlayerBakeRates(player)
  return rates
    .filter(() => player.resources.grain > 0)
    .map((r) => ({ value: r.cardId, labelKey: r.labelKey }))
}

const parseBulkBakePlan = (
  player: PlayerState,
  payload: string,
  rateMap: Map<string, BakeRate>,
): BakePlanEntry[] | null => {
  if (!payload.trim()) return null

  const countByCard = new Map<string, number>()
  for (const rawEntry of payload.split(',')) {
    const [cardId, countText, ...extra] = rawEntry.split('=')
    if (!cardId || countText === undefined || extra.length > 0) return null
    const count = Number(countText)
    if (!Number.isInteger(count) || count <= 0) return null
    countByCard.set(cardId, (countByCard.get(cardId) ?? 0) + count)
  }

  const plan: BakePlanEntry[] = []
  let totalGrain = 0
  for (const [cardId, count] of countByCard) {
    const rate = rateMap.get(cardId)
    if (!rate) return null
    if (count > rate.max) return null
    totalGrain += count
    plan.push({ cardId, count })
  }

  if (plan.length === 0) return null
  if (totalGrain <= 0 || totalGrain > player.resources.grain) return null
  return plan
}

const applyBakePlan = (
  player: PlayerState,
  plan: BakePlanEntry[],
): ActionExecutionResult => {
  const immediateLogs: ImmediateLogEntry[] = []
  for (const entry of plan) {
    const result = bakeBread(player, entry.cardId, entry.count)
    if (result.type !== 'ok') return failInvalidBake()
    if (result.immediateLogs) immediateLogs.push(...result.immediateLogs)
  }
  return { type: 'ok', immediateLogs }
}

const resolveBakeBreadChoice = (
  player: PlayerState,
  choice: string,
): ActionExecutionResult => {
  if (choice === 'cancel') return failInvalidBake()
  const rates = getPlayerBakeRates(player)
  const rateMap = new Map(rates.map((r) => [r.cardId, r]))

  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    const plan = parseBulkBakePlan(player, payload, rateMap)
    if (!plan) return failInvalidBake()
    return applyBakePlan(player, plan)
  }

  if (choice.startsWith('count-')) {
    const [, cardId, countText] = choice.split('-')
    const rate = rateMap.get(cardId!)
    const count = Number(countText)
    if (!rate || !Number.isInteger(count) || count <= 0) return failInvalidBake()
    if (count > rate.max || count > player.resources.grain) return failInvalidBake()
    return bakeBread(player, cardId!, count)
  }

  const rate = rateMap.get(choice)
  if (rate) {
    const grain = player.resources.grain
    const maxCount = Math.max(0, Math.min(grain, rate.max))
    if (maxCount <= 0) return failInvalidBake()
    if (maxCount <= 1) {
      return bakeBread(player, choice, maxCount)
    }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        structuredChoicePrefixes: ['bulk:'],
        options: Array.from({ length: maxCount }, (_, index) => ({
          value: `count-${choice}-${index + 1}`,
          labelKey: 'ui.interactionBakeBreadCountLabel',
          labelParams: { count: index + 1 },
        })),
      },
      promptKey: 'ui.interactionBakeBreadCount',
    }
  }
  return failInvalidBake()
}

export const bakeBreadAction: ActionDefinition = {
  id: 'bake-bread',
  nameKey: 'actions.bake-bread.name',
  descriptionKey: 'actions.bake-bread.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => canBakeBreadDirectly(player),
  execute: ({ player }) => {
    const options = buildBakeBreadOptions(player)
    if (options.length === 0) return { type: 'ok' }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options,
        structuredChoicePrefixes: ['bulk:'],
      },
      promptKey: 'ui.interactionBakeBreadChoice',
    }
  },
  resolveChoice: ({ player }, choice) => resolveBakeBreadChoice(player, choice),
}
