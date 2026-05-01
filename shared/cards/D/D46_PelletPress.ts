import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D46_PelletPress'

const anytimeListener: CardListenerRegistration = {
  id: 'D46-pellet-press-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.reed < 1) return

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: context.player.id,
            startRound: context.state.round + 1,
            count: 4,
            resources: { food: 1 },
          }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D46_PelletPress.anytime',
    }
  },
}

export const D46_PelletPress = new MinorImprovement({
  id: CARD_ID,
  name: 'Pellet Press',
  deck: 'D',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: [
    'Once per round, you can pay 1 <REED>. If you do, place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: { clay: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

export const D46_PelletPress_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
