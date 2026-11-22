import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields } from '../../helpers/card-field'
import { queueFutureMeeplesFlow } from '../../../actions/effects/internal/future-meeples'

const CARD_ID = 'CWM100_PlumPatch'

const cardImpl = {
  prerequisiteCheck: (player) =>
    ['grain', 'vegetable'].every((crop) =>
      getLogicalFields(player).some((f) =>
        f.stacks.some((s) => s.kind === crop && s.remaining > 0),
      ),
    ),
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: Array.from(
          {
            length: getLogicalFields(player).filter((f) => f.stacks.some((s) => s.remaining > 0))
              .length,
          },
          (_, i) => state.round + i + 1,
        )
          .filter((round) => round <= 14)
          .map((round) => ({ round, resources: { food: 1 } })),
      }),
  },
} satisfies CardImpl

export const CWM100_PlumPatch = defineMinorCard({
  meta: {
    id: 'CWM100_PlumPatch',
    name: "Plum Patch",
    deck: 'CWM',
    number: 100,
    desc: ["Count your sown <FIELD> and place 1 <FOOD> on each of that many subsequent round spaces. At the start of those rounds, you get the <FOOD>. Card <FIELD> count for both the prerequisite and this count; each sown card counts as one <FIELD>."],
    cost: {},
    vp: 1,
    prerequisite: "1 grain field and 1 vegetable field",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM100.png',
  },
  impl: cardImpl,
})

export const CWM100_PlumPatch_impl = CWM100_PlumPatch.impl
