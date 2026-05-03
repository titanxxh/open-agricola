import type {
  ActionDefinition,
  ActionExecutionResult,
  ComplexCost,
  CostModifierType,
  PaymentSolution,
  Resource,
} from '../../game/types'
import { addCardResourcePaid } from '../../cards/helpers/card-state'
import {
  canPayCost,
  canPayResources,
  computeAllBuyableCombinations,
  executePaymentSolution,
  isComplexCost,
  payResources,
  returnCardToBoard,
} from '../helpers/payment'
import {
  payTypedFlatCost,
  resolveCostPaymentSelection,
} from '../helpers/pay-helpers'

export type PayParams = {
  cost: Partial<Resource> | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  includeReturnedCard?: boolean
  playedCards?: string[]
}

/**
 * Pay leaf success result includes `extraData.bonusUsed` (string[] of card ids
 * whose BonusModifier.sources fired this payment), `bonusChoiceIndex`
 * (per-card chosen variant index, only when the bonus had multiple choices),
 * `feeIndex` (which fee variant in a fees[] array was paid), and
 * `returnedCardId` (when `includeReturnedCard` was set on params and the
 * payment consumed a card).
 *
 * Listeners on `actions: ['pay']` read these via `context.result.extraData`.
 * This is the canonical signal for "the card I own contributed to this
 * payment" — see E54_Contraband / E122_Cottar / E128_Saddler /
 * E123_ResourceHoarder for examples.
 *
 * Legacy note: `player._activeActionBonusSources` is still maintained by
 * `executePaymentSolution` for `log.actionDetail` attribution (read by
 * `GameCore.buildActionDetailParts`) and the legacy `playOccupation` /
 * `playImprovement` HTTP entries that don't go through the `pay` leaf.
 * New listeners should not depend on it.
 */

const RESOURCE_KEYS = new Set([
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
])

const PAY_PARAM_KEYS = new Set([
  'cost',
  'costType',
  'optionPrefix',
  'paymentChoice',
  'includeReturnedCard',
  'playedCards',
])

const looksLikeFlatResource = (
  raw: Record<string, unknown> | undefined,
): boolean => {
  if (!raw) return false
  const keys = Object.keys(raw)
  if (keys.length === 0) return false
  if (keys.some((k) => PAY_PARAM_KEYS.has(k))) return false
  return keys.every((k) => RESOURCE_KEYS.has(k))
}

const normalizePayParams = (
  raw: Record<string, unknown> | undefined,
): PayParams | undefined => {
  if (!raw) return undefined
  if ('cost' in raw) return raw as unknown as PayParams
  if (looksLikeFlatResource(raw)) {
    return { cost: raw as Partial<Resource> }
  }
  return undefined
}

const buildSelectedResult = (
  solution: PaymentSolution,
  sourceCard: string | undefined,
  costType: CostModifierType | undefined,
  player: import('../../game/types').PlayerState,
  state: import('../../game/types').GameState,
  includeReturnedCard?: boolean,
): ActionExecutionResult => {
  executePaymentSolution(player, solution, { costType, state })
  if (includeReturnedCard && solution.cardUsed) {
    returnCardToBoard(player, solution.cardUsed, state)
  }
  // Hand the wrapper-flow context to the next leaf (apply-improvement /
  // apply-occupation-play) so its onBuy listener can still receive a real
  // `PaymentInfo` (returned card id is what C60_SmallPottersOven keys its
  // 5-food gain on, etc.) and so apply-* can echo `resourcesPaid` back into
  // the canonical `log.playOccupation` / `log.playImprovement` log entries
  // (D95 SiteManager scoping, log-cost attribution tests).
  if (
    costType === 'major-improvement'
    || costType === 'minor-improvement'
    || costType === 'occupation'
    || costType === 'renovation'
  ) {
    player._pendingImprovementPaymentInfo = {
      resourcesPaid: solution.resourcesPaid,
      feeIndex: solution.feeIndex,
      returnedCardId: solution.cardUsed,
    }
  }
  const resourcesPaid = solution.resourcesPaid
  if (sourceCard) {
    addCardResourcePaid(player, sourceCard, resourcesPaid)
  }
  const extraData: Record<string, unknown> = {
    resourcesPaid,
    bonusUsed: solution.bonusUsed
      ? solution.bonusUsed.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  }
  if (solution.bonusChoiceIndex) {
    extraData.bonusChoiceIndex = solution.bonusChoiceIndex
  }
  if (solution.cardUsed) {
    extraData.returnedCardId = solution.cardUsed
  }
  if (solution.feeIndex !== undefined) {
    extraData.feeIndex = solution.feeIndex
  }
  if (sourceCard) {
    return {
      type: 'ok',
      resourcesPaid,
      logKey: 'log.cardEffectPay',
      logParams: { cost: resourcesPaid, cardId: sourceCard },
      extraData,
    }
  }
  return {
    type: 'ok',
    resourcesPaid,
    extraData,
  }
}

export const payAction: ActionDefinition = {
  id: 'pay',
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  // Typed-flat costs resolve eagerly inside execute() and return `ok`, so
  // the default Sequence([ActionNode, ChoiceNode]) wrap would leave a
  // dangling empty ChoiceNode that blocks the surrounding seq (D129 etc.).
  // ComplexCost multi-solution emits a payment choice via the engine's
  // fallback `pendingChoiceNodeId = node.id` path, which still routes the
  // player choice back through resolveChoice.
  skipChoiceWrap: true,
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: ({ params }) => {
      const p = normalizePayParams(params)
      if (!p?.cost) return {}
      if (isComplexCost(p.cost)) return p.cost.fee ?? {}
      return p.cost
    },
    // ComplexCost may be affordable only via bonus/trade variants. The default
    // `canPayResources(getBaseCost())` check would erroneously fail because it
    // ignores those alternatives. Explicitly route ComplexCost through
    // computeAllBuyableCombinations so multi-solution payments — including
    // ones that require returning a card via cards.list — stay doable
    // inside seq nodes.
    canExecute: ({ player, params }) => {
      const p = normalizePayParams(params)
      if (!p?.cost) return false
      if (!isComplexCost(p.cost)) {
        return canPayCost(player, p.cost, p.costType)
      }
      const solutions = computeAllBuyableCombinations(
        player,
        p.cost,
        p.playedCards,
        p.costType,
      )
      return solutions.length > 0
    },
  },
  execute: ({ player, params, sourceCard, state }) => {
    const p = normalizePayParams(params)
    if (!p?.cost) return { type: 'fail', logKey: 'log.payFail' }
    if (isComplexCost(p.cost)) {
      const optionPrefix = p.optionPrefix ?? 'pay:generic'
      const selection = resolveCostPaymentSelection(
        player,
        p.cost,
        optionPrefix,
        p.paymentChoice,
        { type: 'fail', logKey: 'log.payFail' },
        {
          costType: p.costType,
          includeReturnedCard: p.includeReturnedCard,
          playedCards: p.playedCards,
        },
      )
      if (selection.type !== 'selected') {
        return selection
      }
      return buildSelectedResult(
        selection.solution,
        sourceCard,
        p.costType,
        player,
        state,
        p.includeReturnedCard,
      )
    }
    const flat = p.cost as Partial<Resource>
    // 7b1: when a costType is set, route the flat cost through
    // payTypedFlatCost so trade modifiers (A28 ForestSchool wood→food etc.)
    // get the silent cost-replacement treatment they had in the legacy
    // payCardPreviewCost path. Without this the flat branch would just
    // attempt canPayResources(flat) and fail when the player can only
    // afford the cost via a trade swap.
    if (p.costType) {
      const ok = payTypedFlatCost(player, flat, p.costType, state)
      if (!ok) return { type: 'fail', logKey: 'log.payFail' }
      if (
        p.costType === 'major-improvement'
        || p.costType === 'minor-improvement'
        || p.costType === 'occupation'
        || p.costType === 'renovation'
      ) {
        // Stash the typed-flat resourcesPaid for the downstream apply-* leaf
        // so log.playOccupation / log.playImprovement can echo the actual
        // post-trade cost (D95 SiteManager scoping etc.). The
        // ComplexCost branch sets the same field in buildSelectedResult.
        player._pendingImprovementPaymentInfo = {
          resourcesPaid: flat,
        }
      }
      if (sourceCard) {
        addCardResourcePaid(player, sourceCard, flat)
        return {
          type: 'ok',
          resourcesPaid: flat,
          logKey: 'log.cardEffectPay',
          logParams: { cost: flat, cardId: sourceCard },
        }
      }
      return { type: 'ok', resourcesPaid: flat }
    }
    if (!canPayResources(player, flat)) {
      return { type: 'fail', logKey: 'log.payFail' }
    }
    payResources(player, flat)
    if (sourceCard) {
      addCardResourcePaid(player, sourceCard, flat)
      return {
        type: 'ok',
        resourcesPaid: flat,
        logKey: 'log.cardEffectPay',
        logParams: { cost: flat, cardId: sourceCard },
      }
    }
    return { type: 'ok', resourcesPaid: flat }
  },
  // Multi-solution payments emit a `prompt.selectPayment` choice from
  // `execute`; when the player picks a solution the engine routes the value
  // here so we can re-run the cost selection with `paymentChoice` set, this
  // time landing on the `selected` branch and actually mutating resources.
  // Without this hook the engine's fallthrough would return `{type:'ok'}`
  // without paying, leaving downstream `seq` leaves (e.g. apply-improvement)
  // running on un-paid state.
  resolveChoice: ({ player, params, sourceCard, state }, choice) => {
    const p = normalizePayParams(params)
    if (!p?.cost) return { type: 'fail', logKey: 'log.payFail' }
    if (!isComplexCost(p.cost)) {
      // Non-ComplexCost paths never reach resolveChoice (execute paid eagerly
      // and returned `ok`). Treat any stray invocation as a no-op success.
      return { type: 'ok' }
    }
    // If the value isn't one of the payment-prefix options the player saw,
    // assume it's a stale/improvement-level choice that landed here because
    // game-core's pendingChoiceActionId now points at `pay` (vs the
    // improvement-any it would point at in the legacy mutate-in-place path).
    // Re-emit the same selectPayment prompt by re-invoking execute so the
    // player can pick again, matching BGA's "missed the prompt → ask again"
    // UX and keeping legacy D83-style upper-flow tests compatible.
    const optionPrefix = p.optionPrefix ?? 'pay:generic'
    const choiceLooksLikePayment =
      choice.startsWith(`${optionPrefix}:`) || /^\d+$/.test(choice)
    if (!choiceLooksLikePayment) {
      return payAction.execute({ player, params, sourceCard, state, space: undefined as never })
    }
    const selection = resolveCostPaymentSelection(
      player,
      p.cost,
      optionPrefix,
      choice,
      { type: 'fail', logKey: 'log.payFail' },
      {
        costType: p.costType,
        includeReturnedCard: p.includeReturnedCard,
        playedCards: p.playedCards,
      },
    )
    if (selection.type !== 'selected') {
      return selection
    }
    return buildSelectedResult(
      selection.solution,
      sourceCard,
      p.costType,
      player,
      state,
      p.includeReturnedCard,
    )
  },
}
