import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  ImmediateLogEntry,
  PlayerState,
} from '../../contract/types'
import { getPlayerBakeRates, hasAnyBakingImprovement } from '../../cards/helpers/exchange-registry'
import { addFoodFromConversion, incResourceConverted } from '../../logic/stats'

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
  const options: ActionChoiceOption[] = rates
    .filter(() => player.resources.grain > 0)
    .map((r) => ({ value: r.cardId, labelKey: r.labelKey }))
  options.push({ value: 'cancel', labelKey: 'ui.interactionCancel' })
  return options
}

const resolveBakeBreadChoice = (
  player: PlayerState,
  choice: string,
): ActionExecutionResult => {
  if (choice === 'cancel') return { type: 'ok' }
  const rates = getPlayerBakeRates(player)
  const rateMap = new Map(rates.map((r) => [r.cardId, r]))

  if (choice.startsWith('bulk:')) {
    const payload = choice.replace('bulk:', '').trim()
    if (!payload) return { type: 'ok' }
    const immediateLogs: ImmediateLogEntry[] = []
    payload.split(',').forEach((entry) => {
      const [cardId, countText] = entry.split('=')
      const rate = rateMap.get(cardId!)
      if (!rate) return
      const count = Number(countText)
      if (!Number.isFinite(count) || count <= 0) return
      const allowed = Math.min(count, rate.max)
      if (allowed <= 0) return
      const result = bakeBread(player, cardId!, allowed)
      if (result.type === 'ok' && result.immediateLogs) {
        immediateLogs.push(...result.immediateLogs)
      }
    })
    return immediateLogs.length > 0 ? { type: 'ok', immediateLogs } : { type: 'ok' }
  }

  if (choice.startsWith('count-')) {
    const [, cardId, countText] = choice.split('-')
    if (rateMap.has(cardId!)) {
      return bakeBread(player, cardId!, Number(countText))
    }
    return { type: 'ok' }
  }

  const rate = rateMap.get(choice)
  if (rate) {
    const grain = player.resources.grain
    const maxCount = Math.max(0, Math.min(grain, rate.max))
    if (maxCount <= 1) {
      return bakeBread(player, choice, maxCount)
    }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: Array.from({ length: maxCount }, (_, index) => ({
          value: `count-${choice}-${index + 1}`,
          labelKey: 'ui.interactionBakeBreadCountLabel',
          labelParams: { count: index + 1 },
        })),
      },
      promptKey: 'ui.interactionBakeBreadCount',
    }
  }
  return { type: 'ok' }
}

export const bakeBreadAction: ActionDefinition = {
  id: 'bake-bread',
  nameKey: 'actions.bake-bread.name',
  descriptionKey: 'actions.bake-bread.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) =>
    player.resources.grain > 0 && hasAnyBakingImprovement(player),
  execute: ({ player }) => ({
    type: 'request',
    request: { kind: 'choice', options: buildBakeBreadOptions(player) },
    promptKey: 'ui.interactionBakeBreadChoice',
  }),
  resolveChoice: ({ player }, choice) => resolveBakeBreadChoice(player, choice),
}
