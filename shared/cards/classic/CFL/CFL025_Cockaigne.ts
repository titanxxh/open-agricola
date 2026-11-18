import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { bonusVpLeaf } from '../../helpers/pay-gain-node'
import { isCardFlagged } from '../../helpers/card-state'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CFL025_Cockaigne'

const REST = 'card_CFL025_Cockaigne_rest'
registerAdHocAction({
  id: REST,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    player.workPhaseSkippedAtRound = state.round
    return { type: 'ok' }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onWorkStart: (_state, player) => {
      if (
        isCardFlagged(player, CARD_ID) ||
        !(['food', 'grain', 'vegetable', 'sheep', 'boar', 'stone'] as const).every(
          (resource) => player.resources[resource] >= 1,
        )
      )
        return
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-flag', flag: true },
          },
          { type: 'leaf', actionId: REST, sourceCard: CARD_ID },
          bonusVpLeaf(CARD_ID, 7),
        ],
      }
    },
  },
} satisfies CardImpl

export const CFL025_Cockaigne = defineMinorCard({
  meta: {
    id: 'CFL025_Cockaigne',
    name: 'Cockaigne',
    deck: 'CFL',
    number: 25,
    extraVp: true,
    occupationPrerequisites: {
      max: 1,
    },
    desc: [
      'Once in the game, if you have at least 1 each of <FOOD>, <GRAIN>, <VEGETABLE>, <SHEEP>, <PIG>, and <STONE>, you may skip an entire work phase to get 7 bonus points. You do not pay these goods.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL025.png',
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})
