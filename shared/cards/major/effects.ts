import type { MajorHooks } from './types'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

const scoreByResourceTiers = (
  quantity: number,
  tiers: readonly { min: number; max?: number; score: number }[],
) => {
  for (const tier of tiers) {
    if (quantity >= tier.min && (tier.max === undefined || quantity <= tier.max)) {
      return tier.score
    }
  }
  return 0
}

/**
 * Major card hooks, keyed by major id. Built as a separate map so
 * `cards-display/major/*` can stay hook-free (display-only) and
 * `cards/major/index.ts` composes display + effects at module init.
 *
 * Majors with no hooks (fireplace1/2, cookingHearth1/2 — exchange-only)
 * deliberately do not appear here; the composition spreads `{}` for them.
 */
export const majorEffects: Record<string, MajorHooks> = {
  Major_Joinery: {
    onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: 'Major_Joinery' }),
    computeBonusScore: (_state, player) =>
      scoreByResourceTiers(player.resources.wood ?? 0, [
        { min: 7, score: 3 },
        { min: 5, max: 6, score: 2 },
        { min: 3, max: 4, score: 1 },
      ]),
  },
  Major_Pottery: {
    onHarvest: createSingleHarvestExchange('clay', { food: 2 }),
    computeBonusScore: (_state, player) =>
      scoreByResourceTiers(player.resources.clay ?? 0, [
        { min: 7, score: 3 },
        { min: 5, max: 6, score: 2 },
        { min: 3, max: 4, score: 1 },
      ]),
  },
  Major_Basket: {
    onHarvest: createSingleHarvestExchange('reed', { food: 3 }),
    computeBonusScore: (_state, player) =>
      scoreByResourceTiers(player.resources.reed ?? 0, [
        { min: 5, score: 3 },
        { min: 4, max: 4, score: 2 },
        { min: 2, max: 3, score: 1 },
      ]),
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
