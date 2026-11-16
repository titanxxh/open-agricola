import { parseTeamConfiguration, type TeamConfiguration, type TeamState, type TeamScoreSummary } from '../contract/team'
import type { GameSeed, Resource } from '../contract/types'
import { createSeededRng, shuffleWithRng } from '../utils/rng'
import type { PlayerScoreSummary } from './scoring'

export function createTeamState(configuration: TeamConfiguration, playerCount: number, seed: GameSeed, assignments?: number[]): TeamState {
  parseTeamConfiguration(configuration, playerCount)
  const teamCount = playerCount / configuration.seatsPerTeam
  const separated = Array.from({ length: playerCount }, (_, index) => index % teamCount)
  const playerTeams = assignments ? [...assignments] : configuration.seating === 'random'
    ? shuffleWithRng(separated, createSeededRng(seed, 'team-seating')) : separated
  if (playerTeams.length !== playerCount || playerTeams.some(index => !Number.isInteger(index) || index < 0 || index >= teamCount)
    || Array.from({ length: teamCount }, (_, index) => index).some(index => playerTeams.filter(team => team === index).length !== configuration.seatsPerTeam)) {
    throw new Error('Invalid team assignments')
  }
  return { configuration: { ...configuration }, playerTeams }
}

export function computeTeamScores(scores: PlayerScoreSummary[], team: TeamState, players: { id: string; resources: Pick<Resource, 'wood' | 'clay' | 'reed' | 'stone'> }[]): TeamScoreSummary[] {
  const results = Array.from({ length: team.playerTeams.length / team.configuration.seatsPerTeam }, (_, teamIndex): TeamScoreSummary => {
    const members = players.filter((_, index) => team.playerTeams[index] === teamIndex)
    const memberScores = members.flatMap(player => scores.filter(score => score.playerId === player.id))
    const factors = memberScores.map(score => ({ playerId: score.playerId, total: score.total, clampedTotal: Math.max(0, score.total) }))
    const categories = [...new Set(memberScores.flatMap(score => score.categories.map(category => category.key)))].map(key => {
      const values = memberScores.map(score => ({ playerId: score.playerId, total: score.categories.find(category => category.key === key)?.total ?? 0 }))
      const total = Math.min(...values.map(value => value.total))
      return { key, total, playerIds: values.filter(value => value.total === total).map(value => value.playerId) }
    })
    const scoring = team.configuration.scoring
    let total: number
    switch (scoring) {
      case 'sum': total = memberScores.reduce((sum, score) => sum + score.total, 0); break
      case 'product': total = factors.reduce((product, factor) => product * factor.clampedTotal, 1); break
      case 'category-min': total = categories.reduce((sum, category) => sum + category.total, 0); break
      case 'total-min': total = Math.min(...memberScores.map(score => score.total)); break
    }
    return {
      teamIndex, playerIds: members.map(player => player.id), scoring: team.configuration.scoring,
      total, rank: 1,
      buildingResources: members.reduce((sum, player) => sum + player.resources.wood + player.resources.clay + player.resources.reed + player.resources.stone, 0),
      categories: scoring === 'category-min' ? categories : [], factors: scoring === 'product' ? factors : [],
    }
  })
  for (const result of results) {
    result.rank = 1 + results.filter(other => other.total > result.total
      || (other.total === result.total && other.buildingResources > result.buildingResources)).length
  }
  return results
}
