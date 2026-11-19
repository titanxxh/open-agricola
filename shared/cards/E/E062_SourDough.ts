import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { peopleLeftToPlace } from '../../actions/guest-turns'
import type { CardImpl } from '../registry'

const CARD_ID = 'E062_SourDough'
const anytimeListener: CardListenerRegistration = {
  id: 'E62-sour-dough-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  replacesTurn: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // Every player must still have a person to place, a Guest included
    const allPlayersHaveWorkers = context.state.players.every(
      (p) => peopleLeftToPlace(context.state, p, context.actionHooks) > 0,
    )
    if (!allPlayersHaveWorkers) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onRoundStart: () => ({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E062_SourDough = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sour Dough',
    deck: 'E',
    number: 62,
    desc: ['Once per round, if all players have at least 1 person left to place, you can skip placing a person and take a __Bake Bread__ action instead.'],
    cost: {},
    vp: 1,
    prerequisite: '3 Occupations and 1 Baking Improvement',
    occupationPrerequisites: { min: 3 },
    category: 'FOOD_-_GRAIN',
  },
  impl: cardImpl,
})

export const E062_SourDough_impl = E062_SourDough.impl
