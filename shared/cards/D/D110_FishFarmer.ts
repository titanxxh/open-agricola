import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D110_FishFarmer'
const listener: CardListenerRegistration = {
  id: 'D110-fish-farmer-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D110_FishFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Fish Farmer',
    deck: 'D',
    number: 110,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time there is 1/2/3+ <FOOD> on the __Fishing__ accumulation space, you get an additional 2 <FOOD> on the __Reed Bank__/ __Clay Pit__/ __Forest__ accumulation spaces.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D110_FishFarmer_impl = D110_FishFarmer.impl
