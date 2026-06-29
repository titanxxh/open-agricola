import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasMoorSpecialActionChoice, MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID } from '../../moor/special-action-flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'M054_AgriculturalImplement'
const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])
const choiceContext = { mode: 'take-card' }

const listener: CardListenerRegistration = {
  id: 'M054-agricultural-implement-after-field-action',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!TRIGGER_SPACES.has(context.space?.id ?? '')) return
    if (!hasMoorSpecialActionChoice(context.state, context.player, choiceContext)) return
    return {
      flow: {
        type: 'leaf',
        actionId: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
        optional: true,
        sourceCard: CARD_ID,
        actionContext: choiceContext,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M054_AgriculturalImplement = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Agricultural Implement",
    deck: "M",
    number: 54,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Immediately after each time you use the \"Farmland\" or \"Cultivation\" action space, you can take a face-up special action card. The special action card costs 0 or 2 food, as usual."
    ],
    cost: {
        "wood": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M054_AgriculturalImplement_impl = M054_AgriculturalImplement.impl
