import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B142_Greengrocer'

const listener: CardListenerRegistration = {
  id: 'B142-greengrocer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B142_Greengrocer = new Occupation({
  id: CARD_ID,
  name: 'Greengrocer',
  deck: 'B',
  number: 142,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
})
