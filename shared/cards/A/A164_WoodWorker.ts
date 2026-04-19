import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'A164_WoodWorker'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// A164 Wood Worker: Each time you take wood from an accumulation space, you can exchange
// 1 wood for 1 sheep. Place the wood back on the accumulation space.
const listener: CardListenerRegistration = {
  id: 'A164-wood-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { sheep: 1 },
      choiceLabelKey: 'occupations.A164_WoodWorker.name',
    })
  },
}

registerCardListener(listener)

export const A164_WoodWorker = new Occupation({
  id: CARD_ID,
  name: 'Wood Worker',
  deck: 'A',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you take <WOOD> from an accumulation space, you can exchange 1 <WOOD> for 1 <SHEEP>. Place the <WOOD> on the accumulation space.'],
  cost: {},
  players: '4+',
  newSet: true,
})
