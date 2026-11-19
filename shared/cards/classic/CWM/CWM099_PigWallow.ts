import { getFarmyardFields } from '../../helpers/card-field'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'
import { commitFarmOperation } from '../../../domain/farm-operations'
import { parsePositionKey } from '../../../domain/farm'

const CARD_ID = 'CWM099_PigWallow'

const SELECT = CARD_ID + '-field'
registerSelectionEffect(SELECT, ({ player, positions, eventSink, recordFarmOperation }) => {
  const tiles = positions
    .map(parsePositionKey)
    .filter((tile): tile is { row: number; col: number } => tile !== null)
  recordFarmOperation?.(
    commitFarmOperation(
      player,
      { kind: 'remove-fields', positions: tiles, sourceCardId: CARD_ID },
      eventSink,
    ),
  )
  return {
    type: 'leaf',
    actionId: 'fence',
    sourceCard: CARD_ID,
    actionContext: {
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 4 } },
        newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 1, max: 1 } },
        costPolicy: { fence: { wood: 0 } },
      },
    },
  }
})
const cardImpl = {
  prerequisiteCheck: (player) => getFarmyardFields(player).some((field) => !field.stacks.length),
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
        selectableTiles: getFarmyardFields(player).filter((field) => !field.stacks.length),
      },
    }),
  },
} satisfies CardImpl

export const CWM099_PigWallow = defineMinorCard({
  meta: {
    id: 'CWM099_PigWallow',
    name: "Pig Wallow",
    deck: 'CWM',
    number: 99,
    desc: ["Immediately return one empty farmyard field tile and fence one unused farmyard space for free, following normal fencing rules. Remove any items attached to the returned field. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {
      wood: 1,
      stone: 1,
    },
    vp: 1,
    prerequisite: "1 empty farmyard field",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM099.png',
  },
  impl: cardImpl,
})

export const CWM099_PigWallow_impl = CWM099_PigWallow.impl
