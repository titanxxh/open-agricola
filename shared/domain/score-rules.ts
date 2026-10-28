import type { PlayerScoreSummary } from './scoring'

/** Independent public markers affect totals, but are not ordinary scoring penalties. */
export const getOrdinaryNegativeScoreTotal = (summary: PlayerScoreSummary): number =>
  summary.categories.reduce((total, category) => total + category.entries.reduce(
    (sum, entry) => sum + (entry.type === 'marker' ? 0 : Math.min(0, entry.score)), 0,
  ), 0)
