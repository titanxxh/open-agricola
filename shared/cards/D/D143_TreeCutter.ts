import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D143_TreeCutter'
const NON_WOOD_RESOURCES: (keyof Resource)[] = [
  'clay', 'reed', 'stone', 'food', 'sheep', 'boar', 'cattle', 'grain', 'vegetable',
]

const listener: CardListenerRegistration = {
  id: 'D143-tree-cutter-before-accumulation-space',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['before'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { gainPerRound, resources } = context.space
    if (!Object.values(gainPerRound ?? {}).some((amount) => (amount ?? 0) > 0)) return
    if (!NON_WOOD_RESOURCES.some((res) => (resources?.[res] ?? 0) >= 3)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D143_TreeCutter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Tree Cutter',
    deck: 'D',
    number: 143,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time you use an accumulation space providing at least 3 goods of the same type except <WOOD>, you get an additional 1 <WOOD>. (<FOOD> is also considered a good.)',
      ],
    cost: {},
    players: '3+',
    implemented: true,
  },
  impl: cardImpl,
})

export const D143_TreeCutter_impl = D143_TreeCutter.impl
