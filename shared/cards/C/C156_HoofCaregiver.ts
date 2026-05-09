import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C156_HoofCaregiver } from '../../cards-display/C/C156_HoofCaregiver'

const CARD_ID = C156_HoofCaregiver.id

export const C156_HoofCaregiver_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, _player): ActionFlow | undefined => {
      const cattleMarket = state.actionSpaces.find((s) => s.id === 'cattle-market')
      if (!cattleMarket) return undefined
      cattleMarket.resources.cattle = (cattleMarket.resources.cattle ?? 0) + 1
      const n = cattleMarket.resources.cattle
      return gainLeaf(CARD_ID, { grain: n, food: n })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
