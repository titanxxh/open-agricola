import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C160_Outrider'
/**
 * C160 Outrider (Occupation, 4+ players)
 *
 * "Each time before you use the action space on the most recently revealed
 * action space card (after it has been placed on the round space), you get
 * 1 grain."
 *
 * BGA: isListeningTo uses Globals::getLastRevealed() to filter to events
 * targeting the most recently revealed action card.
 *
 * In open-agricola the last revealed round action is at
 * state.roundActionOrder[state.round - 1]. We fire before place-farmer when
 * the space being used matches that id.
 */

const listener: CardListenerRegistration = {
  id: 'C160-outrider-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const lastRevealed = context.state.roundActionOrder[context.state.round - 1]
    if (!lastRevealed || spaceId !== lastRevealed) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C160_Outrider = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Outrider',
    deck: 'C',
    number: 160,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time before you use the action space on the most recently revealed action space card (after it has been placed on the round space), you get 1 <GRAIN>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C160_Outrider_impl = C160_Outrider.impl
