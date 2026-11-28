import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { defineMinorCard } from '../../card-source'
import { isCardFlagged } from '../../helpers/card-state'
import { farmTokenSelection } from '../../helpers/farm-token-selection'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM062_BackyardWell'

const token = farmTokenSelection(CARD_ID, { stone: 1 }, { adjacentHouse: true })

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-build`,
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        if (isCardFlagged(player, CARD_ID) || token.candidates(player).length === 0) return
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
                params: { kind: 'set-flag', flag: true },
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
    id: CARD_ID,
    name: 'Backyard Well',
    deck: 'CWM',
    number: 62,
    cost: { stone: 2, wood: 1 },
    vp: 2,
    wellIdentity: true,
    desc: [
      'Once this game, at any time, you may place 1 <STONE> from the general supply on 1 Unused farmyard space next to your home. (It now counts as used.) If you do this, place 1 <FOOD> on each of the next 3 Round spaces. At the start of these rounds, you receive the <FOOD>. (Backyard Well counts as a __Well__.)',
    ],
    artUrl: 'assets/classic/CWM/CWM062.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM062_BackyardWell_impl = CWM062_BackyardWell.impl
