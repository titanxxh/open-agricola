import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'C114_SoilScientist'

// C114 Soil Scientist: Each time after you use a clay/stone accumulation space,
// you can place 1 STONE/2 CLAY from your supply on the space to get 2 GRAIN/1 VEGETABLE, respectively.
const listener: CardListenerRegistration = {
  id: 'C114-soil-scientist-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isClay = (gainPerRound.clay ?? 0) > 0
    const isStone = (gainPerRound.stone ?? 0) > 0
    if (!isClay && !isStone) return

    if (isClay) {
      return returnToSpaceThenGainFlow({
        cardId: CARD_ID,
        cost: { stone: 1 },
        gain: { grain: 2 },
      })
    } else {
      return returnToSpaceThenGainFlow({
        cardId: CARD_ID,
        cost: { clay: 2 },
        gain: { vegetable: 1 },
      })
    }
  },
}

registerCardListener(listener)

export const C114_SoilScientist = new Occupation({
  id: CARD_ID,
  name: 'Soil Scientist',
  deck: 'C',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you use a clay/stone accumulation space, you can place 1 <STONE>/2 <CLAY> from your supply on the space to get 2 <GRAIN>/1 <VEGETABLE>, respectively.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
