import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C164_GermanHeathKeeper'

const listener: CardListenerRegistration = {
  id: 'C164-german-heath-keeper-any-pig-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const C164_GermanHeathKeeper = new Occupation({
  id: CARD_ID,
  name: 'German Heath Keeper',
  deck: 'C',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time any player (including you) uses the __Pig Market__ accumulation space, you get 1 <SHEEP> from the general supply.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
  implemented: true,
})
