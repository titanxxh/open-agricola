import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { getOccupation } from '../../game/occupations'
import { canAffordTypedFlatCost, payTypedFlatCost } from './pay-helpers'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'

const canAffordWithPaperMaker = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']>,
) => {
  if (canAffordTypedFlatCost(player, cost, 'occupation')) return true
  if (!player.occupationPlayed.includes('B109_PaperMaker')) return false
  if (player.resources.wood < 1) return false
  const foodNeeded = cost.food ?? 0
  const generatedFood = player.occupationPlayed.length
  if (foodNeeded <= 0 || generatedFood <= 0) return false
  return player.resources.food + generatedFood >= foodNeeded
}

export const isOccupationPlayable = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation || !player.occupationHand.includes(occupation.id)) return false
  const baseCost =
    costOverride ?? getOccupationCost(player, occupationId) ?? occupation.cost ?? {}
  return canAffordWithPaperMaker(player, baseCost)
}

export const playOccupation = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  state?: GameState,
): ActionExecutionResult => {
  const occupation = getOccupation(occupationId)
  if (!occupation) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  if (!player.occupationHand.includes(occupation.id)) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  const baseCost =
    costOverride ?? getOccupationCost(player, occupationId) ?? occupation.cost ?? {}
  if (!payTypedFlatCost(player, baseCost, 'occupation')) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupation.id,
  )
  player.occupationPlayed.push(occupation.id)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`occupation:${occupation.id}`)
  getCardModifiers(occupation.id).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
  // Trigger onBuy hook — if it returns a flow, propagate it to the engine
  if (state) {
    const activation = activateCard(state, player, occupation.id, 'onBuy')
    if (activation.type === 'flow') {
      return activation
    }
  }
  return { type: 'ok' }
}

export const getOccupationCost = (
  player: PlayerState,
  occupationId: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation) return null
  const cost = { ...occupation.cost }
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation')) {
      for (const [key, discount] of Object.entries(mod.discount)) {
        const rk = key as keyof typeof cost
        if ((cost[rk] ?? 0) > 0) {
          cost[rk] = Math.max(0, (cost[rk] ?? 0) - (discount ?? 0))
        }
      }
    }
  }
  return cost
}

const getLessonsCost = (player: PlayerState, spaceId: string) => {
  const isLessons4 = spaceId === 'lessons-4'
  const base = isLessons4
    ? player.occupationPlayed.length <= 1
      ? 1
      : 2
    : player.occupationPlayed.length === 0
      ? 0
      : 1
  const discount = player.occupationPlayed.includes('B109_PaperMaker') ? 1 : 0
  let food = Math.max(0, base - discount)
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation')) {
      if (mod.discount.food && food > 0) {
        food = Math.max(0, food - mod.discount.food)
      }
    }
  }
  return food > 0 ? { food } : {}
}

export const getOccupationActionCost = getLessonsCost

const buildPlayableOccupationOptions = (
  player: PlayerState,
  cost: Partial<PlayerState['resources']>,
): ActionChoiceOption[] =>
  player.occupationHand
    .map((id) => getOccupation(id))
    .filter(
      (occupation): occupation is NonNullable<typeof occupation> =>
        !!occupation,
    )
    .filter(() => canAffordWithPaperMaker(player, cost))
    .map((occupation) => ({
      value: occupation.id,
      labelKey: `occupations.${occupation.id}.name`,
    }))

export const canAffordOccupationActionCost = canAffordWithPaperMaker

export const playOccupationAction: ActionDefinition = {
  id: 'play-occupation',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, space, params }) => {
    const cost =
      (params as { costOverride?: Partial<PlayerState['resources']> } | undefined)?.costOverride ??
      getLessonsCost(player, space.id)
    const playableOptions = buildPlayableOccupationOptions(player, cost)
    if (playableOptions.length === 0) {
      return { type: 'ok' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionChooseOccupation',
      options: playableOptions,
    }
  },
  resolveChoice: ({ player, space, params, state }, choice) => {
    const cost =
      (params as { costOverride?: Partial<PlayerState['resources']> } | undefined)?.costOverride ??
      getLessonsCost(player, space.id)
    return playOccupation(player, choice, cost, state)
  },
}
