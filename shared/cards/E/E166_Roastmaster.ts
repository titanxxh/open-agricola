import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E166_Roastmaster'

// Each time you use Traveling Players or Fishing,
// optionally move 1 food from that space to the other, then get 1 cattle.
// Simplified: if the space has food available to move, gain 1 cattle.
// (The food movement between spaces is not fully simulated.)
const listener: CardListenerRegistration = {
  id: 'E166-roastmaster-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'traveling-players' && spaceId !== 'fishing') return
    // Check if the current space has food to move
    const currentFood = context.space?.resources?.food ?? 0
    if (currentFood <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { cattle: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E166_Roastmaster = new Occupation({
  id: CARD_ID,
  name: 'Roastmaster',
  deck: 'E',
  number: 166,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Traveling Players__ or __Fishing__ accumulation spaces, you can move exactly 1 <FOOD> from that space to the other to get 1 <CATTLE>.'],
  cost: {},
  players: '4+',
})

export const E166_Roastmaster_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
