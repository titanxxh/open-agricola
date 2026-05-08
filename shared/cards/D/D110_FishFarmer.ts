import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D110_FishFarmer } from '../../cards-display/D/D110_FishFarmer'
export { D110_FishFarmer }

const CARD_ID = D110_FishFarmer.id

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

export const D110_FishFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
