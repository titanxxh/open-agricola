import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { getMajorCard } from '../major'
import { PaymentSolver } from '../../actions/payment'
import type { PaymentCtx } from '../../actions/payment'
import { gainLeaf } from '../helpers/pay-gain-node'
import { returnCardToBoard } from '../helpers/return-card'
import type { CardImpl } from '../registry'

const CARD_ID = 'C060_SmallPottersOven'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const
type OvenId = (typeof OVEN_IDS)[number]

const getReturnableOvens = (player: CardListenerContext['player']) =>
  OVEN_IDS.filter((id) => player.improvements.includes(id))

const returnOvenLeaf = (id: OvenId): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  choiceLabelKey: `improvements.${id}.name`,
  params: { kind: 'return-card-to-board', cardId: id },
})

const getAvailableOvenChoices = (context: CardListenerContext) => {
  const playerIdx = context.state.players.indexOf(context.player)
  const ctx: PaymentCtx = { actionId: CARD_ID, costType: 'none' }
  return OVEN_IDS.filter((id) => {
    if (!context.state.availableMajorImprovements.includes(id)) return false
    const effect = getMajorCard(id)
    if (!effect?.cost) return false
    return PaymentSolver.canAfford(context.state, playerIdx, effect.cost, ctx)
  })
}

const shouldSkipBeforeReachability = (context: CardListenerContext) =>
  context.actionContext?.skipBeforeTriggers === true

const beforeBakeListener: CardListenerRegistration = {
  id: 'C60-small-potters-oven-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (shouldSkipBeforeReachability(context)) return
    const allowedPurchases = getAvailableOvenChoices(context)
    if (allowedPurchases.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        promptKey: 'ui.interactionSmallPottersOvenBuild',
        sourceCard: CARD_ID,
        params: {
          allowedPurchases,
          trueAction: false,
        },
        actionContext: { trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'C60-small-potters-oven-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (shouldSkipBeforeReachability(context)) return
    const allowedPurchases = getAvailableOvenChoices(context)
    if (allowedPurchases.length === 0) return
    return { doable: true }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => getReturnableOvens(player).length > 0,
  listeners: [beforeBakeListener, isDoableListener],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const ovens = getReturnableOvens(player)
      if (ovens.length === 0) return
      if (ovens.length === 1) {
        returnCardToBoard(player, ovens[0]!, state)
        return gainLeaf(CARD_ID, { food: 5 })
      }
      return {
        type: 'seq',
        children: [
          {
            type: 'xor',
            promptKey: 'ui.interactionSmallPottersOvenReturn',
            children: ovens.map(returnOvenLeaf),
          },
          gainLeaf(CARD_ID, { food: 5 }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C060_SmallPottersOven = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Small Potter's Oven",
    deck: "C",
    number: 60,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 5 <FOOD>. Each time before you get a __Bake Bread__ action, you can build the __Clay Oven__ or __Stone Oven__ major improvement.",
      ],
    vp: 5,
    cost: { clay: 2 },
    prerequisite: "Return the Clay / Stone Oven",
    alsoCountsAs: ['major'],
  },
  impl: cardImpl,
})

export const C060_SmallPottersOven_impl = C060_SmallPottersOven.impl
