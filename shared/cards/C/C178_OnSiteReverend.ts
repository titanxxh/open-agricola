import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C178_OnSiteReverend'
const buildingResourceChoice = (): ActionFlow => ({
  type: 'xor',
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    gainLeaf(CARD_ID, { clay: 1 }),
    gainLeaf(CARD_ID, { reed: 1 }),
    gainLeaf(CARD_ID, { stone: 1 }),
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: () => buildingResourceChoice(),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C178_OnSiteReverend = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'On-Site Reverend',
    deck: 'C',
    number: 178,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['At the start of each harvest, you get 1 building resource of your choice.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C178_OnSiteReverend_impl = C178_OnSiteReverend.impl
