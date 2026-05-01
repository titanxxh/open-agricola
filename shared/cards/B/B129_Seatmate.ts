import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { isSpaceOccupied, spaceHasPlayer } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B129_Seatmate'

/**
 * B129 Seatmate — You can use the action space on round space 13 even if it
 * is occupied by one or more people of the players to your immediate left and right.
 *
 * BGA: In 3-player: always allow. In 4-player: allow only if opposite player
 * (seated across the table) has not occupied it.
 *
 * Simplification: in our system we don't have seating positions, so we allow
 * placing on round-13 action space if it is occupied (by any opponent).
 * This is a minor rule deviation but is the best approximation without seat data.
 * Players: 3+.
 */
const computeArgsListener: CardListenerRegistration = {
  id: 'B129-seatmate-compute-args',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round < 13) return
    const round13Space = context.state.actionSpaces.find(
      (s) => s.roundAvailable === 13 || s.id === context.state.roundActionOrder[12],
    )
    if (!round13Space) return
    if (!isSpaceOccupied(round13Space) || spaceHasPlayer(round13Space, context.player.id)) return
    const extraOptions: ActionChoiceOption[] = [
      {
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${round13Space.id}`,
        labelKey: round13Space.nameKey,
        sourceCard: CARD_ID,
      },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const B129_Seatmate = new Occupation({
  id: CARD_ID,
  name: 'Seatmate',
  deck: 'B',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can use the action space on round space 13 even if it is occupied by one or more people of the players to your immediate left and right.'],
  cost: {},
  players: '3+',
})

export const B129_Seatmate_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
