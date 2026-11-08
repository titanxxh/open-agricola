import type { ScoreCategoryResult } from '../domain/scoring'

export type TeamScoring = 'sum' | 'product' | 'category-min' | 'total-min'
export type TeamSeating = 'separated' | 'random'
export type TeamConfiguration = {
  seatsPerTeam: 2 | 3
  seating: TeamSeating
  scoring: TeamScoring
} & ({ mode: 'team'; teammateVisibility: 'shared' | 'private' } | { mode: 'multihand' })

export type TeamState = {
  configuration: TeamConfiguration
  /** Indexed by playerIndex; team indices are zero-based. */
  playerTeams: number[]
}

export type TeamScoreSummary = {
  teamIndex: number
  playerIds: string[]
  scoring: TeamScoring
  total: number
  rank: number
  buildingResources: number
  categories: { key: ScoreCategoryResult['key']; total: number; playerIds: string[] }[]
  factors: { playerId: string; total: number; clampedTotal: number }[]
}

/** Parse once at the creation boundary; absent configuration preserves ordinary play. */
export function parseTeamConfiguration(value: unknown, playerCount: number): TeamConfiguration | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid team configuration')
  const config: Record<string, unknown> = { ...value }
  if ((config.seatsPerTeam !== 2 && config.seatsPerTeam !== 3)
    || !((playerCount === 4 && config.seatsPerTeam === 2) || playerCount === 6)
    || (config.seating !== 'separated' && config.seating !== 'random')
    || (config.scoring !== 'sum' && config.scoring !== 'product' && config.scoring !== 'category-min' && config.scoring !== 'total-min')) {
    throw new Error('Invalid team configuration')
  }
  const common: Pick<TeamConfiguration, 'seatsPerTeam' | 'seating' | 'scoring'> = { seatsPerTeam: config.seatsPerTeam, seating: config.seating, scoring: config.scoring }
  if (config.mode === 'multihand') return { ...common, mode: 'multihand' }
  if (config.mode === 'team' && (config.teammateVisibility === 'shared' || config.teammateVisibility === 'private')) {
    return { ...common, mode: 'team', teammateVisibility: config.teammateVisibility }
  }
  throw new Error('Invalid team configuration')
}
