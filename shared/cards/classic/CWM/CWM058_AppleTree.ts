import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'
import { registerHarvestCountModifier } from '../../../actions/helpers/harvest-count-registry'
import { mutateLogicalFields, getFarmyardFields } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { positionKey } from '../../../domain/farm'

const CARD_ID = 'CWM058_AppleTree'

const SELECT = CARD_ID + '-tree'
registerSelectionEffect(SELECT, ({ state, player, positions, eventSink }) => {
  const field = getFarmyardFields(player).find(
    (field) => positionKey(field) === positions[0] && field.stacks.length === 0,
  )
  if (!field) return
  mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink }).place(
    { row: field.row, col: field.col },
    'wood',
    1,
  )
  writeCardExtraData(player, CARD_ID, 'field', positionKey(field))
})
registerHarvestCountModifier(CARD_ID, ({ player, field }) =>
  player.minorPlayed?.includes(CARD_ID) &&
  readCardExtraData(player, CARD_ID, 'field') === positionKey(field)
    ? { override: 0, sources: [CARD_ID] }
    : undefined,
)
const cardImpl = {
  prerequisiteCheck: (player) =>
    getFarmyardFields(player).some((field) => field.stacks.length === 0),
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
    onHarvestFieldPhase: () => gainLeaf(CARD_ID, { food: 1 }),
  },
} satisfies CardImpl

export const CWM058_AppleTree = defineMinorCard({
  meta: {
    id: 'CWM058_AppleTree',
    name: "Apple Tree",
    deck: 'CWM',
    number: 58,
    desc: ["Put 1 <WOOD> from the supply on an empty farmyard <FIELD>. That <FIELD> counts as sown. During each harvest field phase, you get 1 <FOOD>. The prerequisite requires an actual farmyard <FIELD> tile."],
    cost: {
      wood: 1,
    },
    vp: 1,
    prerequisite: "1 empty farmyard field",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM058.png',
  },
  impl: cardImpl,
})

export const CWM058_AppleTree_impl = CWM058_AppleTree.impl
