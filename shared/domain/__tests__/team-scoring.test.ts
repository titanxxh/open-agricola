import { describe, expect, it } from 'vitest'
import { computeTeamScores, createTeamState } from '../team-scoring'
import { parseTeamConfiguration } from '../../contract/team'
import type { PlayerScoreSummary } from '../scoring'

const scores: PlayerScoreSummary[] = [
  { playerId: 'p1', playerName: 'A', total: 4, categories: [{ key: 'fields', total: 5, entries: [] }, { key: 'beggings', total: -1, entries: [] }] },
  { playerId: 'p2', playerName: 'B', total: 7, categories: [{ key: 'fields', total: 7, entries: [] }] },
  { playerId: 'p3', playerName: 'C', total: -2, categories: [{ key: 'fields', total: 2, entries: [] }, { key: 'beggings', total: -4, entries: [] }] },
  { playerId: 'p4', playerName: 'D', total: 3, categories: [{ key: 'fields', total: 3, entries: [] }] },
]
const players = scores.map(({ playerId }) => ({ id: playerId, resources: { wood: 0, clay: 0, reed: 0, stone: 0 } }))

describe('team scores', () => {
  it('adds seat totals and ranks teams after ordinary scoring', () => {
    const team = createTeamState({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' }, 4, 42)
    expect(team.playerTeams).toEqual([0, 1, 0, 1])
    expect(computeTeamScores(scores, team, players).map(({ teamIndex, total, rank }) => ({ teamIndex, total, rank })))
      .toEqual([{ teamIndex: 0, total: 2, rank: 2 }, { teamIndex: 1, total: 10, rank: 1 }])
  })
  it.each([
    ['product', [0, 21]], ['category-min', [-2, 3]], ['total-min', [-2, 3]],
  ] as const)('aggregates %s independently of seat bonus optimization', (scoring, expected) => {
    const team = createTeamState({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring }, 4, 42)
    const result = computeTeamScores(scores, team, players)
    expect(result.map(item => item.total)).toEqual(expected)
    if (scoring === 'product') expect(result[0]?.factors).toEqual([
      { playerId: 'p1', total: 4, clampedTotal: 4 }, { playerId: 'p3', total: -2, clampedTotal: 0 },
    ])
    if (scoring === 'category-min') expect(result[0]?.categories).toEqual([
      { key: 'fields', total: 2, playerIds: ['p3'] }, { key: 'beggings', total: -4, playerIds: ['p3'] },
    ])
  })
  it('uses remaining building materials to break ties and shares ranks after that', () => {
    const team = createTeamState({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' }, 4, 42)
    const tied = scores.map(score => ({ ...score, total: 5 }))
    expect(computeTeamScores(tied, team, players).map(score => score.rank)).toEqual([1, 1])
    const withResources = players.map(player => ({ ...player, resources: { ...player.resources, reed: player.id === 'p3' ? 1 : 0 } }))
    expect(computeTeamScores(tied, team, withResources).map(score => score.rank)).toEqual([1, 2])
  })
  it.each([2, 3] as const)('supports six players with %i seats per team and reproducible random seating', seatsPerTeam => {
    const config = { mode: 'multihand', seatsPerTeam, seating: 'random', scoring: 'product' } as const
    const team = createTeamState(config, 6, 42)
    expect(team).toEqual(createTeamState(config, 6, 42))
    expect(team.playerTeams.slice().sort()).toEqual(seatsPerTeam === 2 ? [0, 0, 1, 1, 2, 2] : [0, 0, 0, 1, 1, 1])
    const sixScores = Array.from({ length: 6 }, (_, i) => ({ playerId: `p${i + 1}`, playerName: '', total: 2, categories: [] }))
    const sixPlayers = sixScores.map(score => ({ id: score.playerId, resources: { wood: 0, clay: 0, reed: 0, stone: 0 } }))
    expect(computeTeamScores(sixScores, team, sixPlayers).map(score => score.total)).toEqual(seatsPerTeam === 2 ? [4, 4, 4] : [8, 8])
  })
  it.each([[2, 2], [3, 2], [4, 3], [5, 2], [6, 4]])('rejects %i players and %i seats per team', (count, seatsPerTeam) => {
    expect(() => parseTeamConfiguration({ mode: 'multihand', seatsPerTeam, seating: 'separated', scoring: 'sum' }, count)).toThrow('Invalid team configuration')
  })
})
