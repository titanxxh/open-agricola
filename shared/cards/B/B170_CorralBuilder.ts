import { defineOccupationCard } from '../card-source'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
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

const revealedThisRound = (state: GameState): string | null => {
  const actionId = state.roundActionOrder[state.round - 1]
  return REVEAL_SPACES.has(actionId ?? '') ? actionId ?? null : null
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeStartOfTurn: (state: GameState, player: PlayerState) => {
      if (!revealedThisRound(state)) return
      if (!canStartFencing(state, player, undefined, ONE_SPACE_PASTURE_CONTEXT)) return
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
    desc: ['When the "Pig Market" and "Cattle Market" action space cards are each revealed (and placed on the round space), you can immediately fence exactly 1 farmyard space without playing wood.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B170_CorralBuilder_impl = B170_CorralBuilder.impl
