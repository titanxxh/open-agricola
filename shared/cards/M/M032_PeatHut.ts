import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { constructAction } from '../../actions/effects/construct'

const CARD_ID = 'M032_PeatHut'
const CONVERSION_ACTION_CONTEXT = { maxRooms: 1, exactCost: {}, trueAction: false }

const canConvert = (context: CardListenerContext) =>
  context.player.houseType === 'wood' &&
  context.player.minorPlayed.includes(CARD_ID) &&
  constructAction.canBeExecutedByPlayer?.(context.state, context.player, {
    actionContext: CONVERSION_ACTION_CONTEXT,
  }) === true

const conversionFlow = (): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'construct',
      sourceCard: CARD_ID,
      actionContext: CONVERSION_ACTION_CONTEXT,
    },
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'return-card-to-board', cardId: CARD_ID },
    },
  ],
})

const replaceRenovationListener: CardListenerRegistration = {
  id: 'M032-peat-hut-replace-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['computeReplace' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.checkedReplaceAction === true) return
    if (!canConvert(context)) return
    return { decline: true, alternativeFlow: conversionFlow(), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'M032-peat-hut-isdoable-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['isDoable' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable === true) return
    if (!canConvert(context)) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [replaceRenovationListener, isDoableListener],
  effect: {
    id: CARD_ID,
    computeExtraRoomCapacity: () => 1,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M032_PeatHut = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Hut",
    deck: "M",
    number: 32,
    category: "FARM_PLANNER",
    desc: [
        "This card provides room for one person. In the feeding phase of each harvest, it must be heated with 1 <FUEL>. Instead of a \"Renovation\" action, you can remove this card from play and add 1 wooden room to your wood house at no cost."
    ],
    cost: {
        "fuel": 5,
        "reed": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
    heatingRoomDiscount: -1,
  },
  impl: cardImpl,
})

export const M032_PeatHut_impl = M032_PeatHut.impl
