import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { workersAvailable } from '../../game/player'

const CARD_ID = 'D151_SpinDoctor'

// Immediately after using Traveling Players, can place another person on any action space
// (even occupied), excluding Meeting Place.
const listener: CardListenerRegistration = {
  id: 'D151-spin-doctor-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    if (workersAvailable(context.state, context.player) <= 0) return
    // Collect all visible action spaces except Meeting Place
    const addedSpaces = context.state.actionSpaces
      .filter((s) => s.id !== 'meeting-place' && context.state.round >= (s.roundAvailable ?? 1))
      .map((s) => s.id)
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            optional: true,
            sourceCard: CARD_ID,
            params: { allowOccupied: true, added: addedSpaces },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D151_SpinDoctor = new Occupation({
  id: CARD_ID,
  name: 'Spin Doctor',
  deck: 'D',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['Immediately after each time you use the __Traveling Players__ accumulation space, you can place another person on an action space of your choice, regardless whether or not the action space is occupied.'],
  cost: {},
  players: '4+',
})
