import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C140_PackagingArtist'

const listener: CardListenerRegistration = {
  id: 'C140-packaging-artist-before-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C140_PackagingArtist = new Occupation({
  id: CARD_ID,
  name: 'Packaging Artist',
  deck: 'C',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <GRAIN>. Each time you get a __Minor Improvement__ action, you can take a __Bake Bread__ action instead.',
  ],
  cost: {},
  players: '3+',
  evenMoreSet: true,
})

export const C140_PackagingArtist_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
