import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { readCardExtraData } from '../../helpers/card-state'

const CARD_ID = 'CWM012_CovetousFarmer'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-take-missing',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        if (
          state.roundPhase !== 'work' ||
          state.players[state.currentPlayerIndex]?.id !== player.id ||
          readCardExtraData(player, CARD_ID, 'usedRound') === state.round
        )
          return
        const resources = (['wood', 'clay', 'reed', 'stone'] as const).filter(
          (resource) =>
            player.resources[resource] === 0 &&
            state.players.every((p) => p.id === player.id || p.resources[resource] > 0),
        )
        if (!resources.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            children: resources.map((resource) => ({
              type: 'seq',
              children: [
                gainLeaf(CARD_ID, { [resource]: 1 }),
                {
                  type: 'leaf',
                  actionId: 'special-effect',
                  sourceCard: CARD_ID,
                  params: { kind: 'set-extra-data', key: 'usedRound', value: state.round },
                },
              ],
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM012_CovetousFarmer = defineOccupationCard({
  meta: {
    id: 'CWM012_CovetousFarmer',
    name: "Covetous Farmer",
    deck: 'CWM',
    number: 12,
    desc: ["Once per round during your turn, you may get 1 building resource that you have none of and every other player has at least one of."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM012.png',
  },
  impl: cardImpl,
})

export const CWM012_CovetousFarmer_impl = CWM012_CovetousFarmer.impl
