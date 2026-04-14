import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C20_MolePlow'

const listener: CardListenerRegistration = {
  id: 'C20-mole-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const id = context.space?.id
    if (id !== 'farmland' && id !== 'cultivation') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'plow',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C20_MolePlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Mole Plow',
  deck: 'C',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can plow 1 additional field.'],
  cost: { wood: 3, food: 1 },
  prerequisite: 'Play in Round 9 or Later',
  newSet: true,
})
