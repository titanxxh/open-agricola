import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E91_PlowBuilder'

// Joinery and its upgrades in this codebase
const JOINERY_CARDS = ['Major_Joinery']

// Inline harvest rounds to avoid circular dependency with logic/state
const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14]

const anytimeListener: CardListenerRegistration = {
  id: 'E91-plow-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!HARVEST_ROUNDS.includes(context.state.round)) return
    // Check if player owns a Joinery-family card
    const hasJoinery = context.player.improvements.some(id => JOINERY_CARDS.includes(id))
    if (!hasJoinery) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E91_PlowBuilder.anytime',
    }
  },
}

export const E91_PlowBuilder = new Occupation({
  id: CARD_ID,
  name: 'Plow Builder',
  deck: 'E',
  number: 91,
  desc: ['You can build the Joinery when taking a __Minor Improvement__ action. If you use the Joinery (or an upgrade thereof) during the harvest, you can pay 1 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
})

export const E91_PlowBuilder_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
