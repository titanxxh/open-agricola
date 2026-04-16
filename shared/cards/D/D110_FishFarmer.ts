import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D110_FishFarmer'

// Each time there is 1/2/3+ food on Fishing, get additional 2 food on Reed Bank/Clay Pit/Forest.
const listener: CardListenerRegistration = {
  id: 'D110-fish-farmer-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== 'reed-bank' && spaceId !== 'clay-pit' && spaceId !== 'forest') return
    const fishingSpace = context.state.actionSpaces.find((s) => s.id === 'fishing')
    const fishingFood = fishingSpace?.resources?.food ?? 0
    if (
      (fishingFood === 1 && spaceId === 'reed-bank') ||
      (fishingFood === 2 && spaceId === 'clay-pit') ||
      (fishingFood >= 3 && spaceId === 'forest')
    ) {
      return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
    }
  },
}

registerCardListener(listener)

export const D110_FishFarmer = new Occupation({
  id: CARD_ID,
  name: 'Fish Farmer',
  deck: 'D',
  number: 110,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time there is 1/2/3+ food on the __Fishing__ accumulation space, you get an additional 2 <FOOD> on the __Reed Bank__/ __Clay Pit__/ __Forest__ accumulation spaces.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
