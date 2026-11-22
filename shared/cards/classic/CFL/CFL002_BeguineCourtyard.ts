import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { activateSmallestInactive, inactiveWorkersInSupply } from '../../../domain/player'
import { isCardFlagged, setCardFlag } from '../../helpers/card-state'
import type { PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL002_BeguineCourtyard'

const ADOPT = 'card_CFL002_BeguineCourtyard_adopt'
const qualifies = (player: PlayerState) =>
  !isCardFlagged(player, CARD_ID) &&
  inactiveWorkersInSupply(player).length > 0 &&
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
  ].every(([row, col]) => player.roomTiles.some((tile) => tile.row === row && tile.col === col))
const adoptFlow = () => ({ type: 'leaf' as const, actionId: ADOPT, sourceCard: CARD_ID })
registerAdHocAction({
  id: ADOPT,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => qualifies(player),
  execute: ({ player, eventSink }) => {
    if (!qualifies(player)) return { type: 'fail', errorKey: 'log.actionFail' }
    setCardFlag(player, CARD_ID, true)
    while (inactiveWorkersInSupply(player).length) {
      const worker = activateSmallestInactive(player)!
      worker.isNewborn = false
      eventSink?.emit<'worker.promoted'>({
        type: 'worker.promoted',
        playerId: player.id,
        workerId: worker.id,
        from: 'newborn',
        to: 'adult',
      })
    }
    return { type: 'ok' }
  },
})

const cardImpl = {
  effect: { id: CARD_ID, onBuy: (_state, player) => (qualifies(player) ? adoptFlow() : undefined) },
  listeners: [
    {
      id: CARD_ID + '-rooms',
      cardIds: [CARD_ID],
      events: ['farm.roomBuilt'],
      phases: ['after'],
      handler: ({ player }) => (qualifies(player) ? { flow: adoptFlow() } : undefined),
    },
  ],
} satisfies CardImpl

export const CFL002_BeguineCourtyard = defineMinorCard({
  meta: {
    id: 'CFL002_BeguineCourtyard',
    name: 'Beguine Courtyard',
    deck: 'CFL',
    number: 2,
    cost: {
      stone: 2,
      clay: 2,
    },
    vp: 1,
    desc: [
      'Once your house contains the five rooms of a C shape (all three spaces of the left column and the top and bottom spaces of the next column), immediately move all family members still in your supply into your house as adults. They can act this round.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL002.png',
  },
  impl: cardImpl,
})
