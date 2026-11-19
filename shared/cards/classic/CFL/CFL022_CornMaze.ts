import { fieldHasCrop } from '../../../domain/field'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getFarmyardFields, getLogicalFields } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL022_CornMaze'

const cardImpl = {
  prerequisiteCheck: (player) =>
    getLogicalFields(player).filter((field) => fieldHasCrop(field, 'grain')).length >= 2,
  effect: {
    id: CARD_ID,
    onRoundStart: (_state, player) => {
      const fields = getFarmyardFields(player).filter((field) => fieldHasCrop(field, 'grain'))
      const positions = new Set(fields.map((field) => `${field.row}:${field.col}`))
      if (
        fields.some((field) =>
          [
            [0, 1],
            [1, 0],
            [1, 1],
          ].every(([dr, dc]) => positions.has(`${field.row + dr}:${field.col + dc}`)),
        )
      ) {
        return gainLeaf(CARD_ID, { wood: 1, reed: 1 })
      }
    },
  },
} satisfies CardImpl

export const CFL022_CornMaze = defineMinorCard({
  meta: {
    id: 'CFL022_CornMaze',
    name: 'Corn Maze',
    deck: 'CFL',
    number: 22,
    cost: {
      food: 1,
    },
    desc: [
      'At the start of each round, if four of your grain fields form a 2×2 square, you get 1 <WOOD> and 1 <REED>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL022.png',
    prerequisite: '2 grain fields',
  },
  impl: cardImpl,
})
