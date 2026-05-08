import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B5_StoreofExperience } from '../../cards-display/B/B5_StoreofExperience'

const CARD_ID = B5_StoreofExperience.id

const REWARDS: (keyof Resource)[] = ['stone', 'stone', 'stone', 'stone', 'stone', 'reed', 'clay', 'wood']

export const B5_StoreofExperience_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const occsInHand = player.occupationHand.length
    const resource = REWARDS[Math.min(occsInHand, 7)]
    if (!resource) return
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
