import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getClassicBoardColumns } from '../../helpers/classic-board-topology'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL055_Recluse'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state, player) => {
      const alone = getClassicBoardColumns(state).some((column) => {
        const people = state.actionSpaces
          .filter((space) => column.includes(space.id))
          .flatMap((space) => space.takenBy)
          .filter(
            (ref) =>
              !ref.synthetic &&
              state.players
                .find((owner) => owner.id === ref.playerId)
                ?.workers.some((worker) => worker.id === ref.workerId && worker.isActive),
          )
        return people.length > 0 && people.every((person) => person.playerId === player.id)
      })
      if (alone) return gainLeaf(CARD_ID, { food: 1 })
    },
  },
} satisfies CardImpl

export const CFL055_Recluse = defineOccupationCard({
  meta: {
    id: 'CFL055_Recluse',
    name: 'Recluse',
    deck: 'CFL',
    number: 55,
    players: '1+',
    extraVp: true,
    desc: [
      "At the end of each work phase, if at least one board column contains your people and no opponent's people, you get 1 <FOOD>, at most once per round. Round spaces 12 and 13 form one column.",
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL055.png',
  },
  impl: cardImpl,
})
