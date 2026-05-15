import { MinorImprovement } from '../../cards-display/types'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'STUB_BeforeBakeGainClay'

export const STUB_BeforeBakeGainClay = new MinorImprovement({
  id: CARD_ID,
  name: 'STUB Before Bake Gain Clay',
  deck: 'STUB',
  number: 1,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Test stub: before you bake bread, gain 1 clay.'],
  cost: {},
})

const beforeBakeListener: CardListenerRegistration = {
  id: 'STUB-before-bake-gain-clay',
  cardIds: [CARD_ID],
  phases: ['before'],
  actions: ['bake-bread'],
  dispatchMode: 'select',
  handler: () => ({
    flow: gainLeaf(CARD_ID, { clay: 1 }),
    sourceCard: CARD_ID,
  }),
}

export const STUB_BeforeBakeGainClay_impl = {
  listeners: [beforeBakeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
