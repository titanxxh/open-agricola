import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { defineMinorCard } from '../card-source'

const CARD_ID = 'E066_BarnShed'

const listener: CardListenerRegistration = {
  id: 'E66-barn-shed-opponent-forest',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const soloListener: CardListenerRegistration = {
  id: 'E66-barn-shed-solo-forest',
  cardIds: [CARD_ID],
  actionSpaces: ['forest'],
  phases: ['before'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.players.length !== 1) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const E066_BarnShed = defineMinorCard({
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
    listeners: [listener, soloListener],
    reaches: [] as readonly string[],
  },
})

export const E066_BarnShed_impl = E066_BarnShed.impl
