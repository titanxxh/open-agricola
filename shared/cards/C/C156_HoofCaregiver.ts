import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C156_HoofCaregiver'

/**
 * C156 Hoof Caregiver — Occupation (4+ players)
 *
 * BGA `C156_HoofCaregiver::onBuy`:
 *   1. If 'ActionCattleMarket' is revealed (i.e. the cattle-market round
 *      space exists), SPECIAL_EFFECT placeCattle adds 1 cattle to the space.
 *   2. gainNode([GRAIN => N, FOOD => N]) where N = cattle on the space
 *      AFTER the +1 (BGA computes N as `count() + 1`).
 *
 * Our previous implementation truncated to a static gain {grain:1, food:1}
 * and skipped the space mutation entirely.
 *
 * We mutate `state.actionSpaces[cattle-market].resources.cattle += 1` in the
 * onBuy callback (mirrors how D74 / E125 mutate cardStates directly inside
 * onBuy without going through a SE leaf), then return a gainLeaf with the
 * dynamic N.
 */

export const C156_HoofCaregiver = new Occupation({
  id: CARD_ID,
  name: 'Hoof Caregiver',
  deck: 'C',
  number: 156,
  category: 'GOODS_PROVIDER',
  desc: ['Immediately add 1 <CATTLE> from the general supply to the __Cattle Market__ accumulation space. Afterward, for each cattle on __Cattle Market__, you get 1 <GRAIN> plus 1 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})

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
