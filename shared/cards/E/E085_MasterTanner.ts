import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { createEventQuery } from '../../events/query'
import type { CardImpl } from '../registry'

const CARD_ID = 'E085_MasterTanner'
const afterExchangeListener: CardListenerRegistration = {
  id: 'E85-master-tanner-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    const toPlace = createEventQuery(context.actionEvents ?? context.transactionEvents)
      .filter('resource.exchanged', (event) =>
        event.paidFrom.kind === 'player' && event.paidFrom.playerId === context.player.id &&
        event.gainedTo.kind === 'player' && event.gainedTo.playerId === context.player.id,
      ).reduce((sum, event) => sum + Math.min(
        (event.paid.boar ?? 0) + (event.paid.cattle ?? 0), event.gained.food ?? 0,
      ), 0)
    if (toPlace <= 0) return
    return {
      flow: {
        type: 'xor', optional: true, promptKey: 'ui.interactionFlowSelect',
        children: Array.from({ length: toPlace }, (_, index) => ({
          type: 'seq',
          choiceLabelKey: 'ui.interactionMasterTannerStoreCount',
          choiceLabelParams: { count: index + 1 },
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: index + 1 } }),
            ...Array.from({ length: index + 1 }, () => ({
              type: 'leaf' as const, actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: 'food' },
            })),
          ],
        })),
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterExchangeListener],
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    const foodOnCard = getCardStack(player, CARD_ID).length
    return foodOnCard > 0 && foodOnCard === player.rooms ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E085_MasterTanner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Tanner',
    deck: 'E',
    number: 85,
    desc: ['For each <PIG> or <CATTLE> you turn into <FOOD>, you can place 1 of that <FOOD> on this card. While its <FOOD> equals your number of rooms, this card provides room for 1 person.'],
    cost: {},
    players: '1+',
    category: 'FARMYARD_-_PLACE_FOR_PERSON',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const E085_MasterTanner_impl = E085_MasterTanner.impl
