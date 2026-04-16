import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C140_PackagingArtist'

/**
 * C140 Packaging Artist (Occupation)
 *
 * "When you play this card, you immediately get 1 grain. Each time you get a
 * Minor Improvement action, you can take a Bake Bread action instead."
 *
 * BGA: onBuy grants 1 GRAIN. onPlayerComputeReplaceImprovement swaps a
 * MINOR-typed improvement action with bakeBreadNode.
 *
 * Our engine has two minor-related action ids:
 *   - 'minor-improvement' (pure minor action, used by cards like lessons-4)
 *   - 'improvement-any' (used by Major Improvement space — both major + minor)
 *
 * Since Packaging Artist only triggers when the game is about to give a
 * Minor Improvement action, we listen on the pure 'minor-improvement' action
 * and offer optional bake-bread before it (as an additional action the
 * player can take; the "instead" nuance is approximated because our engine
 * executes both actions in sequence when the bake-bread is chosen).
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
})

const listener: CardListenerRegistration = {
  id: 'C140-packaging-artist-before-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

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
