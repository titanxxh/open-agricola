import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D124_Emissary'
const GOOD_TYPES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

for (const good of GOOD_TYPES) {
  const listener: CardListenerRegistration = {
    id: `D124-emissary-${good}`,
    cardIds: [CARD_ID],
    phases: ['anytime' as ActionHookPhase],
    handler: (context: CardListenerContext): ActionHookResult | void => {
      const placed = getCardStack(context.player, CARD_ID)
      if (placed.includes(good)) return
      if ((context.player.resources[good as keyof typeof context.player.resources] ?? 0) < 1) return
      return {
        flow: {
          type: 'seq',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { [good]: 1 } }),
            gainLeaf(CARD_ID, { stone: 1 }),
            { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: good } },
          ],
        },
        sourceCard: CARD_ID,
        labelKey: 'cards.D124_Emissary.anytime',
        labelParams: { good },
      }
    },
  }
  registerCardListener(listener)
}

export const D124_Emissary = new Occupation({
  id: CARD_ID,
  name: 'Emissary',
  deck: 'D',
  number: 124,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['At any time, you can place a good from your supply on this card to get 1 <STONE>. You must place different goods on this card. (<FOOD> is also considered a good.)'],
  cost: {},
  players: '1+',
  newSet: true,
  implemented: true,
})
