import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import type { GameState, PlayerState, ActionFlow } from '../../../contract/types'

const CARD_ID = 'CWM044_SiloGirl'

const schedule = (state: GameState, player: PlayerState): ActionFlow | undefined => {
  if (player.houseType !== 'stone' || readCardExtraData(player, CARD_ID, 'scheduled')) return
  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'scheduled', value: true },
      },
      {
        ...futureMeeplesNode({
          cardId: CARD_ID,
          playerId: player.id,
          entries: Array.from({ length: 14 - state.round }, (_, i) => state.round + i + 1).map(
            (round) => ({ round, resources: round % 2 === 0 ? { grain: 1 } : { vegetable: 1 } }),
          ),
        }),
        sourceCard: CARD_ID,
      },
    ],
  }
}
const cardImpl = {
  effect: { id: CARD_ID, onBuy: schedule },
  listeners: [
    {
      id: CARD_ID + '-stone-house',
      cardIds: [CARD_ID],
      actions: ['renovate-house'],
      phases: ['after'],
      handler: ({ state, player }) => {
        const flow = schedule(state, player)
        return flow ? { sourceCard: CARD_ID, flow } : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM044_SiloGirl = defineOccupationCard({
  meta: {
    id: 'CWM044_SiloGirl',
    name: "Silo Girl",
    deck: 'CWM',
    number: 44,
    desc: ["As soon as you live in a stone house, place 1 <GRAIN> on each remaining even-numbered round space and 1 <VEGETABLE> on each remaining odd-numbered round space. At the start of those rounds, you get the crop."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM044.png',
  },
  impl: cardImpl,
})

export const CWM044_SiloGirl_impl = CWM044_SiloGirl.impl
