import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPlayerBakeRates } from '../helpers/exchange-registry'

const CARD_ID = 'STUB_BeforeBakeGainClay'

const beforeBakeListener: CardListenerRegistration = {
  id: 'STUB-before-bake-gain-clay',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['bake-bread'],
  handler: () => ({
    flow: gainLeaf(CARD_ID, { clay: 1 }),
    sourceCard: CARD_ID,
  }),
}

const isDoableListener: CardListenerRegistration = {
  id: 'STUB-before-bake-gain-clay-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable'],
  actions: ['bake-bread'],
  handler: (context) => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (getPlayerBakeRates(context.player).length === 0) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeBakeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const STUB_BeforeBakeGainClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'STUB Before Bake Gain Clay',
    deck: 'STUB',
    number: 1,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Test stub: before you bake bread, gain 1 clay.'],
    cost: {},
  },
  impl: cardImpl,
})

export const STUB_BeforeBakeGainClay_impl = cardImpl
