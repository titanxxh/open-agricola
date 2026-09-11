import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E062_SourDough'
const anytimeListener: CardListenerRegistration = {
  id: 'E62-sour-dough-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  replacesTurn: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // All players must still have workers to place
    const allPlayersHaveWorkers = context.state.players.every(
      (p) => workersAvailable(context.state, p) > 0,
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
      labelKey: 'cards.E062_SourDough.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
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
