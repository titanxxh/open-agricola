import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { RoundPreparationContext } from '../../contract/card-effect-hooks'

const CARD_ID = 'A096_TaskArtisan'
const isStoneQuarryReveal = (context?: RoundPreparationContext): boolean => context?.kind === 'after-reveal'
  && (context.revealedAction?.actionId === 'western-quarry' || context.revealedAction?.actionId === 'eastern-quarry')
/**
 * A96 Task Artisan:
 * - onBuy: gain 1 wood + optional minor improvement action.
 * - onAfterRevealAction: when a stone quarry is revealed, gain 1 wood + optional minor improvement action.
 *
 * Rule: onBuy → parallel(gain 1 wood, optional improvement(minor)).
 *       isListeningTo → AfterRevealAction on western/eastern quarry.
 *       onPlayerAfterRevealAction → parallel(gain 1 wood, optional improvement(minor)).
 *
 */

const buildTaskArtisanFlow = () => ({
  type: 'parallel' as const,
  children: [
    gainLeaf(CARD_ID, { wood: 1 }),
    {
      type: 'leaf' as const,
      actionId: 'improvement',
      actionContext: { types: ['minor'] },
      optional: true,
      sourceCard: CARD_ID,
    },
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => buildTaskArtisanFlow(),
    stageEligibility: {
      onAfterRevealAction: (_state, _player, ctx) => isStoneQuarryReveal(ctx.roundPreparation),
    },
    onAfterRevealAction: (_state, _player, ctx) => {
      if (!isStoneQuarryReveal(ctx?.roundPreparation)) return
      return buildTaskArtisanFlow()
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A096_TaskArtisan = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Task Artisan',
    deck: 'A',
    number: 96,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card and each time a <STONE> accumulation space appears on a round space in the preparation phase, you get 1 <WOOD> and a __Minor Improvement__ action.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A096_TaskArtisan_impl = A096_TaskArtisan.impl
