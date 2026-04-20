import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C150_ParrotBreeder'

const anytimeListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          gainLeaf(CARD_ID, { grain: 1 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C150_ParrotBreeder.anytime',
    }
  },
}

export const C150_ParrotBreeder = new Occupation({
  id: CARD_ID,
  name: 'Parrot Breeder',
  deck: 'C',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'On your turn, if you pay 1 <GRAIN> to the general supply, you can use the same action space (unless it is the __Meeting Place__ action space) that the player to your right has just used on their turn (not retroactive).',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})

export const C150_ParrotBreeder_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    // Unflag at the start of each round so the anytime action can be used once
    // per round (mirrors the BGA once-per-round semantics implicitly tied to
    // the onPlayerAfterPlaceFarmer unflag).
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
