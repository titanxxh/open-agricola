import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B105_CaseBuilder } from '../../cards-display/B/B105_CaseBuilder'

const CARD_ID = B105_CaseBuilder.id

export const B105_CaseBuilder_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const resources: (keyof Resource)[] = ['food', 'grain', 'vegetable', 'reed', 'wood']
    const gain: Partial<Resource> = {}
    for (const res of resources) {
      if ((player.resources[res] ?? 0) >= 2) {
        gain[res] = 1
      }
    }
    if (Object.keys(gain).length === 0) return
    return gainLeaf(CARD_ID, gain)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
