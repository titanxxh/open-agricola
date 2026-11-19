import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { GameState, PlayerState } from '../../../contract/types'
import { getRoundPersonPlacementDetails } from '../../helpers/round-placement'
import { workersAvailable } from '../../../domain/player'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM036_MasterCook'

const othersPlaced = (state: GameState, player: PlayerState) =>
  state.players
    .filter((p) => p.id !== player.id)
    .reduce((n, p) => n + getRoundPersonPlacementDetails(p).length, 0)
const GUEST = 'card_' + CARD_ID + '_guest'
registerAdHocAction({
  id: GUEST,
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    const id = String(
      Math.max(0, ...player.workers.map((w) => Number(w.id)).filter(Number.isFinite)) + 1,
    )
    player.workers.push({
      id,
      isActive: false,
      isNewborn: false,
      removedFromSupply: true,
      supplyUse: {
        sourceCard: CARD_ID,
        disposition: 'remove-from-game',
        status: 'temporary',
        returnRound: state.round,
      },
    })
    writeCardExtraData(player, CARD_ID, 'usedRound', state.round)
    writeCardExtraData(player, CARD_ID, 'othersPlaced', othersPlaced(state, player))
    return { type: 'flow', flow: gainLeaf(CARD_ID, { food: 2 }) }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    blocksWorkerPlacement: (state, player) =>
      readCardExtraData(player, CARD_ID, 'usedRound') === state.round &&
      readCardExtraData(player, CARD_ID, 'othersPlaced') === othersPlaced(state, player),
  },
  listeners: [
    {
      id: CARD_ID + '-first',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      replacesTurn: true,
      handler: ({ state, player }) => {
        if (
          getRoundPersonPlacementDetails(player).length ||
          workersAvailable(state, player) < 1 ||
          !state.players.some((p) => p.id !== player.id && workersAvailable(state, p) > 0)
        )
          return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'seq',
            children: [
              { type: 'leaf', actionId: 'spend-worker', sourceCard: CARD_ID },
              { type: 'leaf', actionId: GUEST, sourceCard: CARD_ID },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM036_MasterCook = defineOccupationCard({
  meta: {
    id: 'CWM036_MasterCook',
    name: "Master Cook",
    deck: 'CWM',
    number: 36,
    desc: ["Each round, you may place your first family member on this card to get 2 food and a guest for that round. The guest inherits that member's restrictions. You may not use any card effect to place your first and second people consecutively after using this effect."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM036.png',
  },
  impl: cardImpl,
})

export const CWM036_MasterCook_impl = CWM036_MasterCook.impl
