import { defineOccupationCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'B170_CorralBuilder'
const REVEAL_SPACES = new Set(['pig-market', 'cattle-market'])
const ONE_SPACE_PASTURE_CONTEXT = {
  trueAction: false,
  fencePolicy: {
    segmentBounds: { total: { min: 1, max: 4 } },
    newPastureBounds: {
      count: { min: 1, max: 1 },
      totalSize: { min: 1, max: 1 },
    },
    costPolicy: { fence: { wood: 0 } },
  },
}

const oneSpacePastureFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'fence',
  sourceCard: CARD_ID,
  optional: true,
  actionContext: ONE_SPACE_PASTURE_CONTEXT,
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    stageEligibility: { onAfterRevealAction: (_state, _player, ctx) =>
      ctx.roundPreparation?.kind === 'after-reveal' && REVEAL_SPACES.has(ctx.roundPreparation.revealedAction?.actionId ?? ''),
    },
    onAfterRevealAction: (state, player, ctx) => {
      if (ctx?.roundPreparation?.kind !== 'after-reveal' || !REVEAL_SPACES.has(ctx.roundPreparation.revealedAction?.actionId ?? '')) return
      if (!canStartFencing(ctx?.actionHooks, state, player, undefined, ONE_SPACE_PASTURE_CONTEXT)) return
      return oneSpacePastureFlow()
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B170_CorralBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Corral Builder',
    deck: 'B',
    number: 170,
    category: 'FARM_PLANNER',
    desc: ['When the __Pig Market__ and __Cattle Market__ action space cards are each revealed (and placed on the round space), you can immediately <FENCE> exactly 1 farmyard space without playing <WOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B170_CorralBuilder_impl = B170_CorralBuilder.impl
