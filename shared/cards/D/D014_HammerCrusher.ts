import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { selectedRenovationTarget } from '../helpers/renovation-cost'
import type { CardImpl } from '../registry'

const CARD_ID = 'D014_HammerCrusher'
const listener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-before-renovate',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (selectedRenovationTarget(context) !== 'stone') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { clay: 2, reed: 1 }),
          { type: 'leaf', actionId: 'construct', optional: true, promptKey: 'ui.interactionHammerCrusherBuild' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D14-hammer-crusher-isdoable-renovate',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (selectedRenovationTarget(context) !== 'stone') return
    // With 2 clay + 1 reed from this card, stone renovation becomes possible
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [listener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D014_HammerCrusher = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hammer Crusher",
    deck: "D",
    number: 14,
    category: "FARM_PLANNER",
    desc: ["Immediately before you renovate to <STONE>, you get 2 <CLAY> and 1 <REED> and you can take a __Build Rooms__ action."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const D014_HammerCrusher_impl = D014_HammerCrusher.impl
