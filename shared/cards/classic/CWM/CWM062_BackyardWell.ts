import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { farmTokenSelection } from '../../helpers/farm-token-selection'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'

const CARD_ID = 'CWM062_BackyardWell'

const token = farmTokenSelection(CARD_ID, { stone: 1 }, { adjacentHouse: true })
const cardImpl = {
  effect: { id: CARD_ID, retainFutureMeeplesOnReturn: true },
  listeners: [
    {
      id: CARD_ID + '-build',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        if (readCardExtraData(player, CARD_ID, 'built') || !token.candidates(player).length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'seq',
            children: [
              token.flow(player),
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'built', value: true },
              },
              {
                ...futureMeeplesNode({
                  cardId: CARD_ID,
                  playerId: player.id,
                  startRound: state.round + 1,
                  count: 3,
                  resources: { food: 1 },
                }),
                sourceCard: CARD_ID,
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM062_BackyardWell = defineMinorCard({
  meta: {
    id: 'CWM062_BackyardWell',
    name: "Backyard Well",
    deck: 'CWM',
    number: 62,
    desc: ["Once only, at any time, place 1 stone from the supply on an unused space orthogonally adjacent to a room; the space becomes used. Place 1 food on each of the next 3 round spaces and receive it when that round starts. Returning this card removes the stone but does not cancel the scheduled food."],
    cost: {},
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM062.png',
  },
  impl: cardImpl,
})

export const CWM062_BackyardWell_impl = CWM062_BackyardWell.impl
