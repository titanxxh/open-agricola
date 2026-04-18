import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../game/types'
import { getOccupation } from '../../game/occupations'
import {
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  payTypedFlatCost,
} from './pay-helpers'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
const buildOccupationCostProvider = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
) => () => costOverride ?? getOccupationCost(player, occupationId) ?? {}

const canAffordOccupationPreviewCost = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  actionCardId?: string,
) =>
  canAffordCardPreviewCostByProvider(
    state,
    player,
    'play-occupation',
    occupationId,
    buildOccupationCostProvider(player, occupationId, costOverride),
    actionCardId,
    'occupation',
  )

export const isOccupationPlayable = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  actionCardId?: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation || !player.occupationHand.includes(occupation.id)) return false
  return canAffordOccupationPreviewCost(
    state,
    player,
    occupationId,
    costOverride,
    actionCardId,
  )
}

export const playOccupation = (
  player: PlayerState,
  occupationId: string,
  costOverride?: Partial<PlayerState['resources']>,
  state?: GameState,
  actionCardId?: string,
): ActionExecutionResult => {
  const occupation = getOccupation(occupationId)
  if (!occupation) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  if (!player.occupationHand.includes(occupation.id)) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  const paySucceeded = state
    ? payCardPreviewCostByProvider(
        state,
        player,
        'play-occupation',
        occupationId,
        buildOccupationCostProvider(player, occupationId, costOverride),
        actionCardId,
        'occupation',
      )
    : payTypedFlatCost(
        player,
        buildOccupationCostProvider(player, occupationId, costOverride)(),
        'occupation',
      )
  if (!paySucceeded) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupation.id,
  )
  player.occupationPlayed.push(occupation.id)
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
  let food = base
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
  state: GameState,
  player: PlayerState,
  cost: Partial<PlayerState['resources']>,
  actionCardId?: string,
): ActionChoiceOption[] =>
  player.occupationHand
    .map((id) => getOccupation(id))
    .filter(
      (occupation): occupation is NonNullable<typeof occupation> =>
        !!occupation,
    )
    .filter((occupation) =>
      canAffordOccupationPreviewCost(
        state,
        player,
        occupation.id,
        cost,
        actionCardId,
      ),
    )
    .map((occupation) => ({
      value: occupation.id,
      labelKey: `occupations.${occupation.id}.name`,
    }))

export const canAffordOccupationActionCost = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
  cost: Partial<PlayerState['resources']>,
  actionCardId?: string,
) =>
  canAffordOccupationPreviewCost(
    state,
    player,
    occupationId,
    cost,
    actionCardId,
  )

export const playOccupationAction: ActionDefinition = {
  id: 'play-occupation',
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.lessons.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space, params }) => {
    const cost =
      (params as { costOverride?: Partial<PlayerState['resources']> } | undefined)?.costOverride ??
      getLessonsCost(player, space.id)
    const playableOptions = buildPlayableOccupationOptions(
      state,
      player,
      cost,
      space.id,
    )
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
    return playOccupation(player, choice, cost, state, space.id)
  },
}
