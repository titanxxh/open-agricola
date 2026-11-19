import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'
import { listReturnableStableTiles, returnStableAtTile } from '../../helpers/stable-removal'

const CARD_ID = 'CWM110_StorageShed'

const SELECT = CARD_ID + '-stable'
registerSelectionEffect(SELECT, ({ player, positions }) => {
  const [row, col] = positions[0]!.split('-').map(Number)
  if (returnStableAtTile(player, { row: row!, col: col! }))
    return {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'stable', value: 1 },
    }
})
const cardImpl = {
  prerequisiteCheck: (player) => listReturnableStableTiles(player).length > 0,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      actionContext: {
        selectionKind: 'farm-position',
        selectionEffect: SELECT,
        minSelections: 1,
        maxSelections: 1,
        selectableTiles: listReturnableStableTiles(player),
      },
    }),
    getRuleContributions: (player) => ({
      reservedSupply: { stable: player.cardStates[CARD_ID]?.counters?.stable ?? 0 },
    }),
    computePurchaseResourceGrants: (_state, _player, purchase) =>
      purchase.kind === 'minor' ? [{ wood: 1 }, { clay: 1 }, { reed: 1 }, { stone: 1 }] : [],
  },
} satisfies CardImpl

export const CWM110_StorageShed = defineMinorCard({
  meta: {
    id: 'CWM110_StorageShed',
    name: "Storage Shed",
    deck: 'CWM',
    number: 110,
    desc: ["Place one of your built stables on this card; it cannot be built again. Immediately before you play a minor improvement, you get 1 building resource of your choice."],
    cost: {},
    vp: 1,
    prerequisite: "1 built stable",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM110.png',
  },
  presentation: { counters: ['stable'] },
  impl: cardImpl,
})

export const CWM110_StorageShed_impl = CWM110_StorageShed.impl
