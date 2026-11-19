import { getFarmyardFields } from '../../helpers/card-field'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM065_BoundaryStones'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const ends = getFarmyardFields(player).filter(
        (f) =>
          getFarmyardFields(player).filter(
            (g) => Math.abs(f.row - g.row) + Math.abs(f.col - g.col) === 1,
          ).length === 1,
      ).length
      return ends >= 5 ? 5 : ends >= 2 ? ends - 1 : 0
    },
  },
} satisfies CardImpl

export const CWM065_BoundaryStones = defineMinorCard({
  meta: {
    id: 'CWM065_BoundaryStones',
    name: "Boundary Stones",
    deck: 'CWM',
    number: 65,
    desc: ["At the end of the game, count farmyard field tiles with exactly one orthogonally adjacent field tile. Having 2, 3, 4, or at least 5 such fields gives you 1, 2, 3, or 5 bonus points, respectively."],
    cost: {
      stone: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM065.png',
  },
  impl: cardImpl,
})

export const CWM065_BoundaryStones_impl = CWM065_BoundaryStones.impl
