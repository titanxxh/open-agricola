import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D124_Emissary'
const GOOD_TYPES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

const anytimeListener: CardListenerRegistration = {
  id: 'D124-emissary-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime'],
  preScoring: true,
  blockedAnytimeInteractionKinds: ['animal-reorg'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placed = getCardStack(context.player, CARD_ID)
    const children: ActionFlow[] = GOOD_TYPES
      .filter((good) => !placed.includes(good) && context.player.resources[good] >= 1)
      .map((good) => ({
        type: 'seq',
        children: [
          payLeaf({
            cardId: CARD_ID,
            cost: { [good]: 1 },
          }),
          gainLeaf(CARD_ID, { stone: 1 }),
          { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: good } },
        ],
      }))
    if (children.length === 0) return
    return {
      flow: children.length === 1 ? children[0]! : { type: 'xor', children },
      sourceCard: CARD_ID,
      labelKey: 'cards.D124_Emissary.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D124_Emissary = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Emissary',
    deck: 'D',
    number: 124,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['At any time, you can place a good from your supply on this card to get 1 <STONE>. You must place different goods on this card. (<FOOD> is also considered a good.)'],
    cost: {},
    players: '1+',
    implemented: true,
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const D124_Emissary_impl = D124_Emissary.impl
