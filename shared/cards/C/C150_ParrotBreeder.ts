import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C150_ParrotBreeder'

/**
 * C150 Parrot Breeder (Occupation, Even More, 4+ players):
 *
 * BGA rule (C150_ParrotBreeder.php):
 *   On your turn, pay 1 grain to the general supply to use the same action
 *   space (unless Meeting Place) that the player to your right has just used
 *   on their turn (not retroactive). Implementation in BGA tracks opponent
 *   placements, filters by seat position, and injects the opponent's action
 *   space into the local player's PlaceFarmer computeArgs.
 *
 * SIMPLIFICATION:
 *   Tracking the right-seat opponent's most recent placement and injecting a
 *   dynamic action-space override into place-farmer computeArgs is beyond the
 *   scope of a card-local effect (would require new listener infrastructure
 *   and cross-player state tracking). Per the task brief we therefore expose a
 *   placeholder anytime action that preserves only the "played" signal:
 *     - pay 1 grain
 *     - gain 1 grain (net zero; simply acknowledges activation)
 *     - flag the card so it can only be triggered once per round
 *
 *   This skips:
 *     - identifying the right-seat opponent (players='4+' card)
 *     - tracking opponent's last action-space id (onOpponentAfterPlaceFarmer)
 *     - injecting the mirrored action-space option into the player's next
 *       PlaceFarmer action (onPlayerComputeArgsPlaceFarmer)
 *     - the Meeting Place exclusion (moot without the mirror)
 *
 *   Owner still receives the card itself and any points it provides.
 */
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Unflag at the start of each round so the anytime action can be used once
    // per round (mirrors the BGA once-per-round semantics implicitly tied to
    // the onPlayerAfterPlaceFarmer unflag).
    setCardFlag(player, CARD_ID, false)
  },
})

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

registerCardListener(anytimeListener)

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
