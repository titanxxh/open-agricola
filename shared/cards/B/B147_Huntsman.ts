import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'B147_Huntsman'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// B147 Huntsman: After using a wood accumulation space, you can pay 1 grain to get 1 pig.
const listener: CardListenerRegistration = {
  id: 'B147-huntsman-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { boar: 1 },
    })
  },
}

registerCardListener(listener)

export const B147_Huntsman = new Occupation({
  id: CARD_ID,
  name: 'Huntsman',
  deck: 'B',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time after you use a wood accumulation space, you can pay 1 <GRAIN> to get 1 <PIG>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
