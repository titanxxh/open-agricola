import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D134_OysterEater'

/**
 * D134 Oyster Eater (Occupation, D, 134)
 * Each time the Fishing accumulation space is used (by any player), the card owner
 * gets 1 bonus SCORE and must skip placing their next person that round.
 *
 * BGA: onPlayerAfterPlaceFarmer / onOpponentAfterPlaceFarmer on actionCardType Fishing.
 *  - gainNode(SCORE => 1) to owner
 *  - SPECIAL_EFFECT skipNextPlacement (Globals::setSkipNext)
 *
 * Implementation notes:
 * - The bonus VP is credited via the `bonus-vp` leaf flow (accumulates in
 *   player.cardStates[CARD_ID].counters.bonusVp and is picked up at scoring).
 * - The "must skip next placement" side effect is stored in extraData as a flag
 *   (skipNextPlacement = count remaining) for future integration with the
 *   placement pipeline. We do not currently have a placement-skip hook; recording
 *   the flag keeps the data available without modifying core paths.
 */
const listener: CardListenerRegistration = {
  id: 'D134-oyster-eater-after-fishing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const owner = context.ownerPlayer ?? context.player
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
            actionContext: { targetPlayerId: owner.id },
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
            actionContext: { targetPlayerId: owner.id },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D134_OysterEater = new Occupation({
  id: CARD_ID,
  name: 'Oyster Eater',
  deck: 'D',
  number: 134,
  category: 'POINTS_PROVIDER',
  desc: ['Each time the __Fishing__ accumulation space is used, you get 1 bonus <SCORE> and must skip placing your next person that round. (You can place the person on a later turn.)'],
  cost: {},
  players: '3+',
})

export const D134_OysterEater_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
