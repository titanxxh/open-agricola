import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM031_HumbleFarmboy'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const amount = [1, 3, 6, 9].filter((rounds) => 14 - state.round >= rounds).length
      return amount > 0 ? gainLeaf(CARD_ID, { wood: amount }) : undefined
    },
    computeSharedPostScore: (state) => {
      const counts = state.players.map(
        (p) => new Set([...p.occupationPlayed, ...p.minorPlayed, ...p.improvements]).size,
      )
      const target = Math.min(...counts)
      return state.players.flatMap((p, i) =>
        counts[i] === target ? [{ playerId: p.id, score: 3 }] : [],
      )
    },
  },
} satisfies CardImpl

export const CWM031_HumbleFarmboy = defineOccupationCard({
  meta: {
    id: 'CWM031_HumbleFarmboy',
    name: "Humble Farmboy",
    deck: 'CWM',
    number: 31,
    desc: ["Immediately get 1, 2, 3, or 4 wood if at least 1, 3, 6, or 9 full rounds remain. At the end of the game, every player tied for the fewest played cards gets 3 bonus points."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM031.png',
  },
  impl: cardImpl,
})

export const CWM031_HumbleFarmboy_impl = CWM031_HumbleFarmboy.impl
