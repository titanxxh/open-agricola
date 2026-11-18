import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { bonusVpLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL021_LionsMound'

const cardImpl = {
  prerequisiteCheck: (_player, state) =>
    !!state && state.round >= ([13, 11, 9, 7, 4][Math.min(5, state.players.length) - 1] ?? 4),
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state, player) => {
      for (const id of state.roundActionOrder.slice(0, state.round)) {
        const workers = state.actionSpaces.find((space) => space.id === id)?.takenBy ?? []
        if (workers.some((worker) => worker.playerId === player.id)) return bonusVpLeaf(CARD_ID)
        if (workers.length > 0) return
      }
    },
  },
} satisfies CardImpl

export const CFL021_LionsMound = defineMinorCard({
  meta: {
    id: 'CFL021_LionsMound',
    name: 'Lions Mound',
    deck: 'CFL',
    number: 21,
    cost: {
      clay: 5,
    },
    vp: 1,
    extraVp: true,
    desc: [
      'You may play this card from round 13/11/9/7/4 in a 1/2/3/4/5-player game. At the end of each work phase, if you occupy a round space and no opponent occupies an earlier round space, you get 1 bonus point.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL021.png',
  },
  impl: cardImpl,
})
