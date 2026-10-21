import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M118_TimberMill'

const timberGainFlow = (fuel: number): ActionFlow => {
  if (fuel <= 0) return gainLeaf(CARD_ID, { wood: 1 })
  return {
    type: 'xor',
    children: [
      {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { fuel: 1 } }),
          gainLeaf(CARD_ID, { wood: 2 }),
        ],
      },
      gainLeaf(CARD_ID, { wood: 1 }),
    ],
  }
}

const fellTreesListener: CardListenerRegistration = {
  id: 'M118-timber-mill-before-fell-trees',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['moor-action'],
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.moorAction?.actionId !== 'fell-trees') return
    const player = context.ownerPlayer ?? context.player
    return { flow: timberGainFlow(player.resources.fuel ?? 0), sourceCard: CARD_ID }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'M118-timber-mill-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'wood') < 4) return
    const player = context.ownerPlayer ?? context.player
    return { flow: timberGainFlow(player.resources.fuel ?? 0), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [fellTreesListener, collectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M118_TimberMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Timber Mill",
    deck: "M",
    number: 118,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take the __Fell Trees__ special action or take at least 4 <WOOD> from an accumulation space, you get 1 additional <WOOD>. If you pay 1 <FUEL>, you get 2 additional <WOOD> instead of 1."
    ],
    cost: {
        "clay": 3,
        "stone": 2
    },
    vp: 3,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M118_TimberMill_impl = M118_TimberMill.impl
