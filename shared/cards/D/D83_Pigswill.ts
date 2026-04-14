import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D83_Pigswill'

// Each time you use Fencing, you also get 1 pig (before building fences).
const listener: CardListenerRegistration = {
  id: 'D83-pigswill-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'fencing') return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D83_Pigswill = new MinorImprovement({
  id: CARD_ID,
  name: 'Pigswill',
  deck: 'D',
  number: 83,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Fencing__ action space, you also get 1 <PIG>.'],
  cost: { food: 2 },
  newSet: true,
})
