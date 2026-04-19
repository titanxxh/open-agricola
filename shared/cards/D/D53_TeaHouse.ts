import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'D53_TeaHouse'

/**
 * D53 Tea House — Once per round, you can skip placing your second person and
 * get 1 <FOOD> instead. (You can place the person later that round.)
 *
 * BGA: canBeActivated → !isFlagged && countPlacedFarmers == 1.
 * onPlayerStartOfTurn → unflagCardNode (resets once per round).
 *
 * Implementation: anytime listener (flag-gated, once per round).
 * Available when: card not flagged, player has exactly 1 placed farmer this round.
 * Effect: gain 1 food, flag the card (prevent repeat this round).
 * onBeforeStartOfTurn resets the flag.
 *
 * Prerequisite: Play in Round 6 or Later.
 */
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'D53-tea-house-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    // Only available when player has placed exactly 1 farmer this round
    const roundPlacements = getRoundPlacementOrder(context.player).length
    if (roundPlacements !== 1) return
    // Must still have workers available to place later
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D53_TeaHouse.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const D53_TeaHouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Tea House',
  deck: 'D',
  number: 53,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can skip placing your second person and get 1 <FOOD> instead. (You can place the person later that round.)'],
  cost: { wood: 1, stone: 1 },
  vp: 2,
  prerequisite: 'Play in Round 6 or Later',
})
