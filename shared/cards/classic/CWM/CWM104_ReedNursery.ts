import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields, getFarmyardFields } from '../../helpers/card-field'

const CARD_ID = 'CWM104_ReedNursery'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeSowableFields: (player) =>
      getFarmyardFields(player)
        .filter((f) => !f.stacks.length)
        .map((f) => ({
          tile: { row: f.row, col: f.col },
          allowedCrops: ['grain', 'vegetable', 'reed'],
          sourceCard: CARD_ID,
        })),
    computeCostedBonus: (_state, player) => {
      const fieldReed = getLogicalFields(player).reduce(
        (sum, field) =>
          sum +
          field.stacks.reduce((n, stack) => n + (stack.kind === 'reed' ? stack.remaining : 0), 0),
        0,
      )
      return [
        { cost: {}, score: 0 },
        ...[1, 4, 6, 8].flatMap((reed, i) =>
          reed <= fieldReed + player.resources.reed
            ? [{ cost: { reed: Math.max(0, reed - fieldReed) }, score: i + 1 }]
            : [],
        ),
      ]
    },
  },
} satisfies CardImpl

export const CWM104_ReedNursery = defineMinorCard({
  meta: {
    id: 'CWM104_ReedNursery',
    name: "Reed Nursery",
    deck: 'CWM',
    number: 104,
    desc: ["You may sow reed on farmyard field tiles like grain. At the end of the game, at least 1, 4, 6, or 8 reed in your supply and fields gives 1, 2, 3, or 4 bonus points, respectively."],
    cost: {
      reed: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM104.png',
  },
  impl: cardImpl,
})

export const CWM104_ReedNursery_impl = CWM104_ReedNursery.impl
