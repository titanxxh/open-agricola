import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { defineMinorCard } from '../card-source'

const CARD_ID = 'E66_BarnShed'

/**
 * E66 Barn Shed — Each time another player uses the Forest accumulation space,
 * card owner gets 1 grain.
 *
 * BGA reference: E_66_BarnShed.php
 * scope 'opponent' — fires when an opponent uses Forest, owner gains 1 grain.
 */
const listener: CardListenerRegistration = {
  id: 'E66-barn-shed-opponent-forest',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const E66_BarnShed = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Barn Shed',
    deck: 'E',
    number: 66,
    category: 'CROPS_-_GRAIN',
    desc: [
      'Each time another player (or, in a solo game, you) uses the __Forest__ accumulation space, you get 1 <GRAIN>.',
    ],
    cost: { wood: 2 },
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: {
    listeners: [listener],
    reaches: [] as readonly string[],
  },
})

export const E66_BarnShed_impl = E66_BarnShed.impl
