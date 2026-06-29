import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasExchangeGained, hasResourceMovedToPlayer } from '../helpers/event-provenance'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A048_ShavingHorse'
/**
 * A48 Shaving Horse (MinorImprovement, A, 48)
 *
 * Each time after you obtain at least 1 wood, if you then have 5+ wood you
 * may exchange 1 wood for 3 food. With 7+ wood it becomes mandatory. BGA
 * does not filter by action space — any wood-producing action counts.
 */

const checkAndExchange = (
  context: CardListenerContext,
): ActionHookResult | void => {
  const events = context.actionEvents ?? context.transactionEvents
  const playerId = context.player.id
  const gainedWood = hasResourceMovedToPlayer(events, 'wood', playerId) ||
    hasExchangeGained(events, 'wood', (event) =>
      event.gainedTo.kind === 'player' && event.gainedTo.playerId === playerId,
    )
  if (!gainedWood) return
  const currentWood = context.player.resources.wood ?? 0
  if (currentWood < 5) return
  const mandatory = currentWood >= 7
  return {
    flow: {
      type: 'seq',
      optional: !mandatory,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
        gainLeaf(CARD_ID, { food: 3 }),
      ],
    },
    sourceCard: CARD_ID,
  }
}

const afterObtainListener: CardListenerRegistration = {
  id: 'A48-shaving-horse-after-obtain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain', 'collect', 'receive'],
  handler: checkAndExchange,
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'A48-shaving-horse-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: checkAndExchange,
}

const cardImpl = {
  listeners: [afterObtainListener, afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A048_ShavingHorse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Shaving Horse',
    deck: 'A',
    number: 48,
    category: 'FOOD_PROVIDER',
    desc: ['Each time after you obtain at least 1 <WOOD>, if you then have 5 or more <WOOD> in your supply, you can exchange 1 <WOOD> for 3 <FOOD>. With 7 or more <WOOD>, you must do so.'],
    cost: { wood: 1 },
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A048_ShavingHorse_impl = A048_ShavingHorse.impl
