import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, ComplexCost, GameState, ImmediateLogEntry, PlayerState, Resource } from '../../game/types'
import { getOccupation } from '../../game/occupations'
import {
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  payTypedFlatCost,
  resolveCardPreviewCostByProvider,
} from '../helpers/pay-helpers'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
import { PaymentSolver } from '../payment'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { incOccupationBuilt, recordDraftPlayed } from '../../logic/stats'

const getPositiveResourceLog = (
  resources?: Partial<Resource> | null,
): Partial<Resource> | undefined => {
  if (!resources) return undefined
  const positiveEntries = Object.entries(resources).filter(
    ([, amount]) => (amount ?? 0) > 0,
  )
  if (positiveEntries.length === 0) return undefined
  return Object.fromEntries(positiveEntries) as Partial<Resource>
}

const readActionBonusSources = (player: PlayerState): string[] | undefined => {
  const sources = player._activeActionBonusSources
  if (!sources || sources.length === 0) return undefined
  return [...sources]
}

const buildOccupationLogParams = (
  occupationId: string,
  costResources: Partial<Resource> | undefined,
  bonusSources?: string[],
) => {
  const params: Record<string, unknown> = {
    occupations: occupationId,
    costResources: getPositiveResourceLog(costResources) ?? {},
  }
  if (bonusSources && bonusSources.length > 0) {
    params.bonusSources = [...bonusSources]
  }
  return params
}

const buildOccupationImmediateLogs = (
  occupationId: string,
  costResources: Partial<Resource> | undefined,
  bonusSources?: string[],
) => [
  {
    key: 'log.playOccupation',
    params: buildOccupationLogParams(
      occupationId,
      costResources,
      bonusSources,
    ),
  },
]

const attachOccupationImmediateLogs = (
  result: Extract<ActionExecutionResult, { type: 'ok' | 'flow' }>,
  immediateLogs: ImmediateLogEntry[],
): Extract<ActionExecutionResult, { type: 'ok' | 'flow' }> => {
  result.immediateLogs = [
    ...immediateLogs,
    ...(result.immediateLogs ?? []),
  ]
  return result
}

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
  const cost = buildOccupationCostProvider(player, occupationId, costOverride)()
  const paySucceeded = state
    ? payCardPreviewCostByProvider(
        state,
        player,
        'play-occupation',
        occupationId,
        () => cost,
        actionCardId,
        'occupation',
      )
    : payTypedFlatCost(
        player,
        cost,
        'occupation',
        state,
      )
  if (!paySucceeded) {
    return { type: 'fail', logKey: 'log.occupationFail' }
  }
  const immediateLogs = buildOccupationImmediateLogs(
    occupation.id,
    cost,
    readActionBonusSources(player),
  )
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupation.id,
  )
  player.occupationPlayed.push(occupation.id)
  incOccupationBuilt(player)
  if (state) {
    recordDraftPlayed(player, occupation.id, state.round)
  }
  getCardModifiers(occupation.id).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
  // Trigger onBuy hook — if it returns a flow, propagate it to the engine
  if (state) {
    const activation = activateCard(state, player, occupation.id, 'onBuy')
    if (activation.type === 'flow') {
      return attachOccupationImmediateLogs(activation, immediateLogs)
    }
  }
  return {
    type: 'ok',
    immediateLogs,
  }
}

const getOccupationCost = (
  player: PlayerState,
  occupationId: string,
) => {
  const occupation = getOccupation(occupationId)
  if (!occupation) return null
  // Occupations only ever carry a Partial<Resource> cost (ComplexCost is majors-only).
  const cost: Partial<Resource> = { ...(occupation.cost as Partial<Resource> | undefined) }
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation') && mod.discount) {
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
  const isLessons3 = spaceId === 'lessons-3'
  const base = isLessons3
    ? 2
    : isLessons4
      ? player.occupationPlayed.length <= 1
        ? 1
        : 2
      : player.occupationPlayed.length === 0
        ? 0
        : 1
  let food = base
  for (const mod of player.activeModifiers ?? []) {
    if (mod.type === 'bonus' && mod.appliesTo.includes('occupation') && mod.discount) {
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
    const typed = params as { costOverride?: Partial<PlayerState['resources']>; allowedCards?: string[] } | undefined
    const cost = typed?.costOverride ?? getLessonsCost(player, space.id)
    let playableOptions = buildPlayableOccupationOptions(
      state,
      player,
      cost,
      space.id,
    )
    if (typed?.allowedCards) {
      playableOptions = playableOptions.filter(opt => typed.allowedCards!.includes(opt.value))
    }
    if (playableOptions.length === 0) {
      return { type: 'ok' }
    }
    return {
      type: 'choice',
      promptKey: 'ui.interactionChooseOccupation',
      options: playableOptions,
    }
  },
  // 7b1: rewrite as seq:[pay, apply-occupation-play]. The pay leaf wraps the
  // typed-flat lessons cost as ComplexCost so multi-solution variants
  // (Bonus modifiers, future card discounts) surface a prompt.selectPayment
  // choice. apply-occupation-play then mutates occupationPlayed / activates
  // onBuy. C116 FurnitureMaker now reads the real paid food off the pay
  // leaf's extraData.resourcesPaid instead of reconstructing the lessons
  // cost — see C116_FurnitureMaker.
  resolveChoice: ({ player, space, params, state, sourceCard }, choice) => {
    const typed = params as { costOverride?: Partial<PlayerState['resources']>; allowedCards?: string[] } | undefined
    if (typed?.allowedCards && !typed.allowedCards.includes(choice)) {
      return { type: 'fail', logKey: 'log.occupationFail' }
    }
    const occupation = getOccupation(choice)
    if (!occupation || !player.occupationHand.includes(occupation.id)) {
      return { type: 'fail', logKey: 'log.occupationFail' }
    }
    const baseCost = typed?.costOverride ?? getLessonsCost(player, space.id)
    // Apply computeCosts hook so card-driven trades (B109 PaperMaker
    // wood→food) and bonus modifiers participate in the pay leaf's
    // multi-solution enumeration. Without this the pay leaf only sees the
    // raw lessons cost and ignores B109's wood-for-food trade.
    const previewCost = resolveCardPreviewCostByProvider(
      state,
      player,
      'play-occupation',
      choice,
      () => baseCost,
      space.id,
    )
    // Only wrap as ComplexCost when listener-collected trades / bonuses
    // make the cost meaningfully multi-solution. For the common typed-flat
    // case (just lessons base cost), pass it through as Partial<Resource>
    // so the pay leaf's typed-flat path uses payTypedFlatCost — that is
    // where modifier trades (A28 ForestSchool) get cost-replacement
    // treatment without surfacing a payment prompt.
    const finalCost: ComplexCost | Partial<PlayerState['resources']> =
      previewCost && PaymentSolver.isComplexCost(previewCost)
        ? previewCost
        : ((previewCost as Partial<PlayerState['resources']> | null) ?? baseCost)
    if (
      sourceCard
      && sourceCard !== choice
    ) {
      // BGA-style gained.occupation: when a card causes an occupation to be
      // played as a side-effect, the sourceCard accumulates +1. Track here
      // (pre-pay) so the credit is not lost if pay later fails — matches
      // legacy mutate-in-place semantics.
      addCardResourceGained(player, sourceCard, { occupation: 1 })
    }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            sourceCard: choice,
            params: {
              cost: finalCost,
              costType: 'occupation',
              optionPrefix: `pay:occupation:${choice}`,
            },
            actionContext: { costType: 'occupation' },
          },
          {
            type: 'leaf',
            actionId: 'apply-occupation-play',
            sourceCard: choice,
            params: { occupationId: choice },
          },
        ],
      },
    }
  },
}
