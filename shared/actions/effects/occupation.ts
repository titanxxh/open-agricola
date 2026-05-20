import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, ComplexCost, GameState, PlayerState, Resource } from '../../contract/types'
import { getOccupation } from '../../cards/registry-display'
import {
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  payTypedFlatCost,
  resolveCardPreviewCostByProvider,
} from '../payment/internal'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
import { PaymentSolver } from '../payment'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { incOccupationBuilt, recordDraftPlayed } from '../../session/stats'

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
    return { type: 'fail', errorKey: 'log.occupationFail' }
  }
  if (!player.occupationHand.includes(occupation.id)) {
    return { type: 'fail', errorKey: 'log.occupationFail' }
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
    return { type: 'fail', errorKey: 'log.occupationFail' }
  }
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
      return activation
    }
  }
  return { type: 'ok' }
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
      type: 'request',
      request: { kind: 'choice', options: playableOptions },
      promptKey: 'ui.interactionChooseOccupation',
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
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    const occupation = getOccupation(choice)
    if (!occupation || !player.occupationHand.includes(occupation.id)) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
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
    // Always wrap as ComplexCost so the pay leaf routes through
    // resolveCostPaymentSelection. When `activeModifiers` contributes a
    // trade (A28 ForestSchool wood→food) the resulting multi-solution
    // payment surfaces a `prompt.selectPayment` choice instead of being
    // silently auto-resolved by the typed-flat fast path. Single-solution
    // cases (no trade / no bonus) auto-resolve inside the pay leaf without
    // any extra prompt.
    const resolvedCost: ComplexCost | Partial<PlayerState['resources']> =
      previewCost ?? baseCost
    const finalCost: ComplexCost = PaymentSolver.isComplexCost(resolvedCost)
      ? resolvedCost
      : { fee: resolvedCost as Partial<PlayerState['resources']> }
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
