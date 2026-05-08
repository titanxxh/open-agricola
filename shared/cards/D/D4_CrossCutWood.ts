import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D4_CrossCutWood } from '../../cards-display/D/D4_CrossCutWood'
export { D4_CrossCutWood }

const CARD_ID = D4_CrossCutWood.id

export const D4_CrossCutWood_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const stone = player.resources.stone ?? 0
    if (stone === 0) return
    return gainLeaf(CARD_ID, { wood: stone })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
