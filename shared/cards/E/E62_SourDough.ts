import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E62_SourDough'

const anytimeListener: CardListenerRegistration = {
  id: 'E62-sour-dough-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
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
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E62_SourDough.anytime',
    }
  },
}

export const E62_SourDough = new MinorImprovement({
  id: CARD_ID,
  name: 'Sour Dough',
  deck: 'E',
  number: 62,
  desc: ['Once per round, if all players have at least 1 person left to place, you can skip placing a person and take a __Bake Bread__ action instead.'],
  cost: {},
  vp: 1,
  prerequisite: '3 Occupations and 1 Baking Improvement',
  occupationPrerequisites: { min: 3 },
})

export const E62_SourDough_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
