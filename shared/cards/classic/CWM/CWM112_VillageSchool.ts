import { cardIdentityChoice } from '../../../actions/helpers/card-choice'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { PaymentSolver } from '../../../actions/payment'
import type {
  ActionChoiceOption,
  ActionDefinition,
  Bonus,
  ComplexCost,
  PaymentResourceMap,
  PlayerState,
  TurnScopeProjection,
} from '../../../contract/types'
import { isPaymentResourceKey } from '../../../contract/resource-keys'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'
import { defineMinorCard } from '../../card-source'
import { playerHasCardCapability } from '../../helpers/card-type'
import { payLeaf } from '../../helpers/pay-gain-node'
import { isUsedThisTurnOrGap, markUsedThisTurnOrGapLeaf } from '../../helpers/turn-token'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM112_VillageSchool'
const DISCARD_ACTION_ID = 'card_CWM112_VillageSchool_discard-from-hand'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const HANDS = [
  { prefix: 'occ:', zone: 'occupationHand', kind: 'occupation' },
  { prefix: 'min:', zone: 'minorHand', kind: 'minor' },
] as const

const eligibleHandChoices = (player: PlayerState, excludedCardId?: string): ActionChoiceOption[] =>
  HANDS.flatMap(({ prefix, zone, kind }) =>
    player[zone]
      .filter((id) => id !== excludedCardId)
      .map((id) => cardIdentityChoice(id, kind, `${prefix}${id}`)),
  )

const hasEligibleHandCard = (player: PlayerState, excludedCardId?: string): boolean =>
  HANDS.some(({ zone }) => player[zone].some((id) => id !== excludedCardId))

const canUseVillageSchool = (
  player: PlayerState,
  excludedCardId?: string,
  projection?: TurnScopeProjection,
): boolean =>
  !playerHasCardCapability(player, 'preventsHandDiscard')
  && !isUsedThisTurnOrGap(player, CARD_ID, projection)
  && hasEligibleHandCard(player, excludedCardId)

const discardFromHandAction: ActionDefinition = {
  id: DISCARD_ACTION_ID,
  nameKey: 'actions.discard-from-hand.name',
  descriptionKey: 'actions.discard-from-hand.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player, context) => {
    const excluded = typeof context?.params?.excludeCardId === 'string' ? context.params.excludeCardId : undefined
    return hasEligibleHandCard(player, excluded)
  },
  execute: ({ player, params }) => {
    const excluded = typeof params?.excludeCardId === 'string' ? params.excludeCardId : undefined
    const options = eligibleHandChoices(player, excluded)
    if (options.length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionDiscardFromHand',
    }
  },
  resolveChoice: ({ player, params, emitPrivateEvent }, choice) => {
    const excluded = typeof params?.excludeCardId === 'string' ? params.excludeCardId : undefined
    const hand = HANDS.find(({ prefix }) => choice.startsWith(prefix))
    const cardId = hand && choice.slice(hand.prefix.length)
    if (!hand || !cardId || cardId === excluded || !player[hand.zone].includes(cardId)) {
      return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
    }
    player[hand.zone] = player[hand.zone].filter((id) => id !== cardId)
    emitPrivateEvent?.(cardEffectHandChangedEvent(player.id, [cardId], hand.kind, CARD_ID, DISCARD_ACTION_ID))
    return { type: 'ok' }
  },
}

registerAdHocAction(discardFromHandAction)

const OPTIONAL_DISCOUNT_BONUS: Bonus = {
  choices: BUILDING_RESOURCES.map((resource) => ({ discount: { [resource]: 1 } })),
  optional: true,
  choiceAffectsState: true,
  sources: [CARD_ID],
}

const MANDATORY_DISCOUNT_BONUS: Bonus = {
  ...OPTIONAL_DISCOUNT_BONUS,
  optional: false,
}

const readStandalonePayCost = (
  params: Record<string, unknown> | undefined,
): PaymentResourceMap | ComplexCost | undefined => {
  if (!params || params.costType !== undefined) return undefined
  if ('cost' in params && params.cost && typeof params.cost === 'object') {
    return params.cost as PaymentResourceMap | ComplexCost
  }
  const keys = Object.keys(params)
  if (keys.length > 0 && keys.every(isPaymentResourceKey)) {
    return params as PaymentResourceMap
  }
  return undefined
}

const hasBuildingResourceInCost = (cost: PaymentResourceMap | ComplexCost): boolean => {
  if (!PaymentSolver.isComplexCost(cost)) {
    return BUILDING_RESOURCES.some((resource) => (cost[resource] ?? 0) > 0)
  }
  if (cost.bonuses?.some((bonus) => bonus.sources?.includes(CARD_ID))) return false
  const maps = [cost.fee, cost.unitFee, ...(cost.fees ?? [])]
  return maps.some((entry) => entry && BUILDING_RESOURCES.some((resource) => (entry[resource] ?? 0) > 0))
}

const buildDiscountedStandaloneCost = (cost: PaymentResourceMap | ComplexCost): ComplexCost =>
  PaymentSolver.isComplexCost(cost)
    ? { ...cost, bonuses: [...(cost.bonuses ?? []), MANDATORY_DISCOUNT_BONUS] }
    : { fee: cost, bonuses: [MANDATORY_DISCOUNT_BONUS] }

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-compute-costs`,
      cardIds: [CARD_ID],
      actions: ['construct', 'renovate-house', 'fence', 'stables', 'improvement', 'occupation'],
      phases: ['computeCosts'],
      monotoneFenceCost: true,
      handler: (context) => {
        if (!canUseVillageSchool(context.player, context.cardId, context.turnScopeProjection)) return
        return { bonuses: [OPTIONAL_DISCOUNT_BONUS] }
      },
    },
    {
      id: `${CARD_ID}-standalone-pay`,
      cardIds: [CARD_ID],
      actions: ['pay'],
      phases: ['isDoable', 'computeReplace'],
      handler: (context) => {
        if (context.actionContext?.checkedReplaceAction === true) return
        if (!canUseVillageSchool(context.player, undefined, context.turnScopeProjection)) return
        const rawCost = readStandalonePayCost(context.params)
        if (!rawCost || !hasBuildingResourceInCost(rawCost)) return
        const discounted = buildDiscountedStandaloneCost(rawCost)
        const playerIndex = context.state.players.indexOf(context.player)
        if (playerIndex < 0) return
        const affordable = PaymentSolver.hasPaymentOption(context.state, playerIndex, discounted, {
          actionId: 'pay',
          costType: 'none',
        })
        if (!affordable) return
        if (context.phase === 'isDoable') {
          return context.doable ? undefined : { doable: true }
        }
        const baseParams = context.params && 'cost' in context.params ? context.params : {}
        const discountedLeaf = payLeaf({
          cardId: context.sourceCard ?? CARD_ID,
          cost: discounted,
          choiceLabelKey: `cards.${CARD_ID}.name`,
        })
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow:
            discountedLeaf.type === 'leaf' && Object.keys(baseParams).length > 0
              ? { ...discountedLeaf, params: { ...baseParams, ...discountedLeaf.params } }
              : discountedLeaf,
        }
      },
    },
    {
      id: `${CARD_ID}-after-pay`,
      cardIds: [CARD_ID],
      actions: ['pay'],
      phases: ['after'],
      mandatory: true,
      handler: (context) => {
        const payment = context.eventQuery.find(
          'resource.paid',
          (event) => event.bonusSources?.includes(CARD_ID) === true,
        )
        if (!payment) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'seq',
            children: [
              markUsedThisTurnOrGapLeaf(context.player, CARD_ID),
              {
                type: 'leaf',
                actionId: DISCARD_ACTION_ID,
                sourceCard: CARD_ID,
                ...(payment.sourceCardId ? { params: { excludeCardId: payment.sourceCardId } } : {}),
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM112_VillageSchool = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Village School',
    deck: 'CWM',
    number: 112,
    cost: { stone: 1, reed: 1 },
    vp: 1,
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    desc: [
      'Once per turn, when paying a cost, you may discard 1 card from your hand to pay 1 less building resource of your choice.',
    ],
    artUrl: 'assets/classic/CWM/CWM112.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM112_VillageSchool_impl = CWM112_VillageSchool.impl
