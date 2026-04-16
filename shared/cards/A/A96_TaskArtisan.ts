import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A96_TaskArtisan'

/**
 * A96 Task Artisan:
 * - onBuy: gain 1 wood + optional minor improvement action.
 * - onRoundStart: when a stone quarry is revealed, gain 1 wood + optional minor improvement action.
 *
 * BGA: onBuy → parallel(gain 1 wood, optional improvement(minor)).
 *       isListeningTo → AfterRevealAction on western/eastern quarry.
 *       onPlayerAfterRevealAction → parallel(gain 1 wood, optional improvement(minor)).
 *
 * In our system, quarry reveal is detected in onRoundStart by checking roundActionOrder.
 */

const buildTaskArtisanFlow = () => ({
  type: 'parallel' as const,
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    {
      type: 'leaf' as const,
      actionId: 'minor-improvement',
      optional: true,
      sourceCard: CARD_ID,
    },
  ],
})

// onBuy is triggered via the play-occupation after-listener pattern
const onBuyListener: CardListenerRegistration = {
  id: 'A96-task-artisan-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { flow: buildTaskArtisanFlow(), sourceCard: CARD_ID }
  },
}

registerCardListener(onBuyListener)

// onRoundStart: check if the revealed action for this round is a quarry
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    return buildTaskArtisanFlow()
  },
})

export const A96_TaskArtisan = new Occupation({
  id: CARD_ID,
  name: 'Task Artisan',
  deck: 'A',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card and each time a stone accumulation space appears on a round space in the preparation phase, you get 1 <WOOD> and a __Minor Improvement__ action.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
