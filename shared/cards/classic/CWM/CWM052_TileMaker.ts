import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM052_TileMaker'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const amount = [1, 3, 6, 9].filter((rounds) => 14 - state.round >= rounds).length
      return amount > 0 ? gainLeaf(CARD_ID, { clay: amount }) : undefined
    },
    computeSharedPostScore: (state) => {
      const counts = state.players.map((p) => (p.houseType === 'clay' ? p.rooms : 0))
      const target = Math.max(...counts)
      return state.players.flatMap((p, i) =>
        counts[i] === target ? [{ playerId: p.id, score: 2 }] : [],
      )
    },
  },
} satisfies CardImpl

export const CWM052_TileMaker = defineOccupationCard({
  meta: {
    id: 'CWM052_TileMaker',
    name: "Tile Maker",
    deck: 'CWM',
    number: 52,
    desc: ["Immediately get 1, 2, 3, or 4 <CLAY> if at least 1, 3, 6, or 9 full rounds remain. At the end of the game, every player tied for the most clay rooms gets 2 bonus <SCORE>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM052.png',
  },
  impl: cardImpl,
})

export const CWM052_TileMaker_impl = CWM052_TileMaker.impl
