import { defineMinorCard } from '../card-source'
import { familySize } from '../../domain/player'
import { getExtraRoomCapacity } from '../card-effects'
import type { CardImpl } from '../registry'

const CARD_ID = 'C021_HeartofStone'

const cardImpl = {
  effect: {
  id: CARD_ID,
  stageEligibility: { onAfterRevealAction: (_state, _player, ctx) => {
    const revealedAction = ctx.roundPreparation?.kind === 'after-reveal' ? ctx.roundPreparation.revealedAction?.actionId : undefined
    return revealedAction === 'western-quarry' || revealedAction === 'eastern-quarry'
  } },
  onAfterRevealAction: (_state, player, ctx) => {
    const revealedAction = ctx?.roundPreparation?.kind === 'after-reveal' ? ctx.roundPreparation.revealedAction?.actionId : undefined
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    if (familySize(player) >= player.roomTiles.length + getExtraRoomCapacity(player)) return
    return {
      type: 'leaf',
      actionId: 'family-growth',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C021_HeartofStone = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Heart of Stone',
    deck: 'C',
    number: 21,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time a __Quarry__ accumulation space is revealed, if you have room in your house, you can immediately take a __Family Growth__ action without placing a person.',
      ],
    cost: { food: 4 },
  },
  impl: cardImpl,
})

export const C021_HeartofStone_impl = C021_HeartofStone.impl
