import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getPlowableTiles } from '../../actions/effects/plow'
import type { CardImpl } from '../registry'

const CARD_ID = 'M041_CattleCollar'
const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

const shouldTrigger = (context: CardListenerContext) =>
  context.actionId === 'slash-and-burn' ||
  (context.actionId === 'place-farmer' && TRIGGER_SPACES.has(context.space?.id ?? ''))

const listener: CardListenerRegistration = {
  id: 'M041-cattle-collar-after-field-action',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer', 'slash-and-burn'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!shouldTrigger(context)) return
    if ((context.player.resources.cattle ?? 0) < 1) return
    if (getPlowableTiles(context.player).length === 0) return
    return {
      flow: { type: 'leaf', actionId: 'plow', optional: true, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 8
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M041_CattleCollar = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cattle Collar",
    deck: "M",
    number: 41,
    category: "FARM_PLANNER",
    desc: [
        "Each time after you use the \"Farmland\" or \"Cultivation\" action space or take the \"Slash and Burn\" special action, if you have at least 1 cattle, you can plow 1 additional field."
    ],
    cost: {
        "wood": 1
    },
    vp: 1,
    prerequisite: "Play in Round 8 or Later",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M041_CattleCollar_impl = M041_CattleCollar.impl
