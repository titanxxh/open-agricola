import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'C052_HuntsmansHat'
const TRACKED_ACTIONS = ['gain', 'collect', 'receive'] as const

const huntsmansHatListener: CardListenerRegistration = {
  id: 'C52-huntsmans-hat-after-boar-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!(TRACKED_ACTIONS as readonly string[]).includes(context.actionId)) return
    const events = context.actionEvents ?? context.transactionEvents
    const gained = sumResourceMovedFromActionSpace(events, 'boar', (event) =>
      event.to.kind === 'player' && event.to.playerId === context.player.id,
    )
    if (gained <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: gained }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [huntsmansHatListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C052_HuntsmansHat = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Huntsman's Hat",
    deck: "C",
    number: 52,
    category: "FOOD_PROVIDER",
    desc: ["For each new <PIG> you get from the effect of an action space, you also get 1 <FOOD>."],
    vp: 1,
    cost: { reed: 1 },
    prerequisite: "Cooking Improvement",
  },
  impl: cardImpl,
})

export const C052_HuntsmansHat_impl = C052_HuntsmansHat.impl
