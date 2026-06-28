import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B079_Corf'
/**
 * B79 Corf (Minor Improvement):
 * Each time any player (including you) takes at least 3 Stone from an
 * accumulation space, you get 1 Stone from the general supply.
 */

const listener: CardListenerRegistration = {
  id: 'B79-corf-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const triggerPlayer = context.triggerPlayer ?? context.player
    const gained = sumResourceMovedToPlayer(events, 'stone', triggerPlayer.id, (event) =>
      event.from.kind === 'actionSpace',
    )
    if (gained < 3) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B079_Corf = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Corf',
    deck: 'B',
    number: 79,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time any player (including you) takes at least 3 <STONE> from an accumulation space, you get 1 <STONE> from the general supply.',
      ],
    cost: { reed: 1 },
  },
  impl: cardImpl,
})

export const B079_Corf_impl = B079_Corf.impl
