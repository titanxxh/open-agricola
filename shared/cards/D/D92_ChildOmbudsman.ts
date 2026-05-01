import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { familySize } from '../../game/player'
import { getExtraRoomCapacity } from '../card-effects'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../game/types'

const CARD_ID = 'D92_ChildOmbudsman'

const effectiveRooms = (player: PlayerState) =>
  player.rooms + getExtraRoomCapacity(player)

/**
 * D92 Child Ombudsman — From round 5 on, after each place-farmer action,
 * if the player still has free room, offer an optional SEQ that:
 *   1. Records 2 negative VP (via special-effect leaf into cardStates)
 *   2. Performs a free family-growth action
 *
 * Mutation flow rule: the negativeScore counter MUST be incremented via the
 * `special-effect` leaf so the engine sees the mutation only when the player
 * accepts the optional SEQ. Direct writeCardExtraData inside the listener
 * handler would mis-fire on declined SEQ.
 */
const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'D92-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round < 5) return
    if (effectiveRooms(context.player) <= familySize(context.player)) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.D92_ChildOmbudsman.choice',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: {
              kind: 'increment-extra-data',
              key: 'negativeScore',
              amount: 2,
            },
          },
          {
            type: 'leaf',
            actionId: 'family-growth',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D92_ChildOmbudsman = new Occupation({
  id: CARD_ID,
  name: 'Child Ombudsman',
  deck: 'D',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['From round 5 on, if you have room in your house, at the end of each person action, you can take a __Family Growth__ action with that person. If you do, you get 2 negative <SCORE>.'],
  cost: {},
  players: '1+',
})

export const D92_ChildOmbudsman_impl = {
  listeners: [afterPlaceFarmerListener],
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      return -(readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
