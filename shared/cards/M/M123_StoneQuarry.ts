import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { initUsageCounters, setUsageCounterLeaf, usageCounters } from './moor-batch1-helpers'

const CARD_ID = 'M123_StoneQuarry'

const listener: CardListenerRegistration = {
  id: 'M123-stone-quarry-after-hiring-fair',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['hiring-fair'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const player = context.ownerPlayer ?? context.player
    const usage = usageCounters(player, CARD_ID)
    if (usage <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { stone: 1 }),
          setUsageCounterLeaf(CARD_ID, usage - 1),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      initUsageCounters(player, CARD_ID, state.players.length === 3 ? 3 : 5)
    },
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M123_StoneQuarry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Quarry",
    deck: "M",
    number: 123,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Place 5 stone--only 3 stone in 3-player games--on this card. Each time you take the \"Hiring Fair\" special action, you also get 1 stone from this card."
    ],
    cost: {
        "vegetable": 3
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M123_StoneQuarry_impl = M123_StoneQuarry.impl
