import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../../helpers/event-provenance'
import { openRoundForSpace } from '../../../actions/helpers/placement-availability'

const CARD_ID = 'CWM009_Chemist'

const building = ['wood', 'clay', 'reed', 'stone'] as const
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-wood',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: ({ state, player, space, actionEvents }) => {
        if (
          !building.some((k) => (space.gainPerRound[k] ?? 0) > 0) ||
          player.resources.clay < 1 ||
          sumResourceMovedToPlayer(actionEvents ?? [], 'wood', player.id) < 1
        )
          return
        // Setup creates every round space; only a revealed one is on the board.
        const targets = state.actionSpaces.filter(
          (s) =>
            s.id !== space.id &&
            openRoundForSpace(state, s) <= state.round &&
            building.some((k) => (s.gainPerRound[k] ?? 0) > 0),
        )
        if (!targets.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            optional: true,
            children: targets.map((target) => ({
              type: 'seq',
              choiceLabelKey: target.nameKey,
              children: [
                {
                  type: 'leaf',
                  actionId: 'return-to-space',
                  sourceCard: CARD_ID,
                  params: { clay: 1 },
                  actionContext: { targetSpaceId: target.id },
                },
                gainLeaf(CARD_ID, { food: 2 }),
              ],
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM009_Chemist = defineOccupationCard({
  meta: {
    id: 'CWM009_Chemist',
    name: "Chemist",
    deck: 'CWM',
    number: 9,
    desc: ["Whenever you receive <WOOD> from a building-resource accumulation space, you may place 1 <CLAY> from your supply on a different building-resource accumulation space to get 2 <FOOD>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM009.png',
  },
  impl: cardImpl,
})

export const CWM009_Chemist_impl = CWM009_Chemist.impl
