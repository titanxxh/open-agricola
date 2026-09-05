import { defineOccupationCard } from '../card-source'
/**
 * C156 Hoof Caregiver — Occupation (4+ players)
 *
 * The reference `C156_HoofCaregiver::onBuy`:
 *   1. If 'ActionCattleMarket' is revealed (i.e. the cattle-market round
 *      space exists), SPECIAL_EFFECT placeCattle adds 1 cattle to the space.
 *   2. gainNode([GRAIN => N, FOOD => N]) where N = cattle on the space
 *      AFTER the +1 (the reference computes N as `count + 1`).
 *
 * Our previous implementation truncated to a static gain {grain:1, food:1}
 * and skipped the space mutation entirely.
 *
 * We mutate `state.actionSpaces[cattle-market].resources.cattle += 1` in the
 * onBuy callback (mirrors how D74 / E125 mutate cardStates directly inside
 * onBuy without going through a SE leaf), then return a gainLeaf with the
 * dynamic N.
 */

import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getRoundActionSlot } from '../helpers/round-action-topology'

const CARD_ID = 'C156_HoofCaregiver'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, _player): ActionFlow | undefined => {
      if (getRoundActionSlot(state, 'cattle-market') === null) return undefined
      const cattleMarket = state.actionSpaces.find((s) => s.id === 'cattle-market')
      if (!cattleMarket) return undefined
      cattleMarket.resources.cattle = (cattleMarket.resources.cattle ?? 0) + 1
      const n = cattleMarket.resources.cattle
      return gainLeaf(CARD_ID, { grain: n, food: n })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C156_HoofCaregiver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Hoof Caregiver',
    deck: 'C',
    number: 156,
    category: 'GOODS_PROVIDER',
    desc: ['Immediately add 1 <CATTLE> from the general supply to the __Cattle Market__ accumulation space. Afterward, for each <CATTLE> on __Cattle Market__, you get 1 <GRAIN> plus 1 <FOOD>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C156_HoofCaregiver_impl = C156_HoofCaregiver.impl
