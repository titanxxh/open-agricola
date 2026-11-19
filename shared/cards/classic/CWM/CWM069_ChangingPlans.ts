import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'
import { listReturnableStableTiles, returnStableAtTile } from '../../helpers/stable-removal'

const CARD_ID = 'CWM069_ChangingPlans'

const SELECT = CARD_ID + '-stables'
registerSelectionEffect(SELECT, ({ player, positions }) => {
  const count = positions.reduce((sum, key) => {
    const [row, col] = key.split('-').map(Number)
    return sum + (returnStableAtTile(player, { row: row!, col: col! }) ? 1 : 0)
  }, 0)
  return {
    type: 'seq',
    children: Array.from({ length: count }, () => ({
      type: 'leaf',
      actionId: 'plow',
      sourceCard: CARD_ID,
    })),
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
        maxSelections: 2,
        selectableTiles: listReturnableStableTiles(player),
      },
    }),
  },
} satisfies CardImpl

export const CWM069_ChangingPlans = defineMinorCard({
  meta: {
    id: 'CWM069_ChangingPlans',
    name: "Changing Plans",
    deck: 'CWM',
    number: 69,
    desc: ["Immediately return up to 2 built stables to your supply. For each stable returned, you may plow 1 field. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {},
    vp: 0,
    prerequisite: "1 built stable",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM069.png',
  },
  impl: cardImpl,
})

export const CWM069_ChangingPlans_impl = CWM069_ChangingPlans.impl
