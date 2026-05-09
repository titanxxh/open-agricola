import type { MajorHooks } from './types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

/**
 * Major card hooks, keyed by major id. Built as a separate map so
 * `cards-display/major/*` can stay hook-free (display-only) and
 * `cards/major/index.ts` composes display + effects at module init.
 *
 * Majors with no hooks (fireplace1/2, cookingHearth1/2 — exchange-only)
 * deliberately do not appear here; the composition spreads `{}` for them.
 */
export const majorEffects: Record<string, MajorHooks> = {
  Major_Well: {
    onBuy: (state, player) => {
      return queueFutureMeeplesFlow(state, {
        cardId: 'Major_Well',
        playerId: player.id,
        startRound: state.round + 1,
        count: 5,
        resources: { food: 1 },
      })
    },
  },
  Major_Joinery: {
    onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: 'Major_Joinery' }),
  },
  Major_Pottery: {
    onHarvest: createSingleHarvestExchange('clay', { food: 2 }),
  },
  Major_Basket: {
    onHarvest: createSingleHarvestExchange('reed', { food: 3 }),
  },
  Major_StoneOven: {
    onBuy: () => ({
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: 'Major_StoneOven',
    }),
  },
  Major_ClayOven: {
    onBuy: () => ({
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: 'Major_ClayOven',
    }),
  },
}
