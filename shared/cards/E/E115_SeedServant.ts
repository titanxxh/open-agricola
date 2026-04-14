import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E115_SeedServant'

// After Grain Seeds: can take a bake-bread action.
// After Vegetable Seeds: can take a sow action.
const listener: CardListenerRegistration = {
  id: 'E115-seed-servant-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId === 'grain-seeds') {
      return {
        flow: {
          type: 'leaf',
          actionId: 'bake-bread',
          optional: true,
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
      }
    }
    if (spaceId === 'vegetable-seeds') {
      return {
        flow: {
          type: 'leaf',
          actionId: 'sow',
          optional: true,
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

registerCardListener(listener)

export const E115_SeedServant = new Occupation({
  id: CARD_ID,
  name: 'Seed Servant',
  deck: 'E',
  number: 115,
  category: 'CROPS_PROVIDER',
  desc: ['Each time after you use the __Grain Seeds__ action space, you can take a __Bake bread__ action. Each time after you use the __Vegetable Seeds__ action space, you can take a __Sow__ action.'],
  cost: {},
  players: '1+',
})
