import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D143_TreeCutter'
const NON_WOOD_RESOURCES: (keyof Resource)[] = [
  'clay', 'reed', 'stone', 'food', 'sheep', 'boar', 'cattle', 'grain', 'vegetable',
]

const listener: CardListenerRegistration = {
  id: 'D143-tree-cutter-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const hasThreePlus = NON_WOOD_RESOURCES.some((res) =>
      sumResourceMovedToPlayer(events, res, context.player.id, (event) =>
        event.from.kind === 'actionSpace',
      ) >= 3,
    )
    if (!hasThreePlus) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D143_TreeCutter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Tree Cutter',
    deck: 'D',
    number: 143,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time you use an accumulation space providing at least 3 goods of the same type except <WOOD>, you get an additional 1 <WOOD>. (<FOOD> is also considered a good.)',
      ],
    cost: {},
    players: '3+',
    implemented: true,
  },
  impl: cardImpl,
})

export const D143_TreeCutter_impl = D143_TreeCutter.impl
