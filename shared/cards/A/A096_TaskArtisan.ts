import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A096_TaskArtisan'
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
      actionId: 'improvement',
      actionContext: { types: ['minor'] },
      optional: true,
      sourceCard: CARD_ID,
    },
  ],
})

const onBuyListener: CardListenerRegistration = {
  id: 'A96-task-artisan-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: buildTaskArtisanFlow(), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [onBuyListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    return buildTaskArtisanFlow()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A096_TaskArtisan = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Task Artisan',
    deck: 'A',
    number: 96,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card and each time a <STONE> accumulation space appears on a round space in the preparation phase, you get 1 <WOOD> and a __Minor Improvement__ action.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A096_TaskArtisan_impl = A096_TaskArtisan.impl
