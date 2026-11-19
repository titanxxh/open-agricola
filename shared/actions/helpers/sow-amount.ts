import type { GameState, PlayerState } from '../../contract/types'
import {
  getCardEffect,
  type ExtraSowableCrop,
  type SowAmountContext,
  type SowTarget,
} from '../../cards/card-effects'
import { BASE_SOW_AMOUNT, MIN_SOW_AMOUNT } from '../../domain/sow-amount'

/**
 * Sow amount modifier point (#1891).
 *
 * Before a Sow places anything, every played card of the sowing player may
 * adjust each target through `CardEffect.modifySowAmount`. Fixed deltas always
 * apply; optional deltas are offered to the player inside the Sow action. The
 * final amount is `base + fixed + chosen optional`, at least `MIN_SOW_AMOUNT`,
 * so the result does not depend on card order. The same amount feeds farmyard
 * fields, Card Fields, extra crop spaces and `farm.sown.added`.
 */
export type SowAmountPlan = {
  key: string
  target: SowTarget
  crop: ExtraSowableCrop
  base: number
  fixedDelta: number
  fixedSources: string[]
  optional: { cardId: string; delta: number }[]
}

export type SowAmountTargetInput = { key: string; target: SowTarget; crop: ExtraSowableCrop }

const playedCardIds = (player: PlayerState) => [
  ...new Set([...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]),
]

export const planSowAmounts = (input: {
  state: GameState
  player: PlayerState
  targets: readonly SowAmountTargetInput[]
  sourceCard?: string
  actionContext?: Record<string, unknown>
}): SowAmountPlan[] => {
  const selections = input.targets.map(({ target, crop }) => ({ row: target.row, col: target.col, crop }))
  const modifiers = playedCardIds(input.player).flatMap((cardId) => {
    const modify = getCardEffect(cardId)?.modifySowAmount
    return modify ? [{ cardId, modify }] : []
  })
  return input.targets.map(({ key, target, crop }) => {
    const plan: SowAmountPlan = {
      key, target, crop, base: BASE_SOW_AMOUNT[crop], fixedDelta: 0, fixedSources: [], optional: [],
    }
    const context: SowAmountContext = {
      state: input.state,
      player: input.player,
      crop,
      target,
      selections,
      sourceCard: input.sourceCard,
      actionContext: input.actionContext,
    }
    for (const { cardId, modify } of modifiers) {
      const result = modify(context)
      if (!result || !Number.isSafeInteger(result.delta) || result.delta === 0) continue
      if (result.optional) {
        plan.optional.push({ cardId, delta: result.delta })
      } else {
        plan.fixedDelta += result.delta
        plan.fixedSources.push(cardId)
      }
    }
    return plan
  })
}

/** Optional sources in the order the player is asked, each with the targets it may improve. */
export const optionalSowAmountSources = (plans: readonly SowAmountPlan[]) => {
  const sources = new Map<string, string[]>()
  for (const plan of plans) {
    for (const { cardId } of plan.optional) {
      sources.set(cardId, [...(sources.get(cardId) ?? []), plan.key])
    }
  }
  return [...sources].map(([cardId, keys]) => ({ cardId, keys }))
}

export const finalSowAmount = (
  plan: SowAmountPlan,
  chosen: Readonly<Record<string, readonly string[]>> = {},
) => {
  const optionalDelta = plan.optional
    .filter(({ cardId }) => chosen[cardId]?.includes(plan.key) === true)
    .reduce((sum, { delta }) => sum + delta, 0)
  return Math.max(MIN_SOW_AMOUNT, plan.base + plan.fixedDelta + optionalDelta)
}
