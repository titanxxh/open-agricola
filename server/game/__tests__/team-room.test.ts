import { describe, expect, it } from 'vitest'
import { createTeamState } from '../../../shared/domain/team-scoring'
import type { TeamRoomMember } from '../../../shared/contract/team-room'
import { planTeamSeating } from '../team-room'

describe('team account seating plan', () => {
  it.each([
    { count: 4, seatsPerTeam: 2, seating: 'separated' },
    { count: 4, seatsPerTeam: 2, seating: 'random' },
    { count: 6, seatsPerTeam: 2, seating: 'separated' },
    { count: 6, seatsPerTeam: 2, seating: 'random' },
    { count: 6, seatsPerTeam: 3, seating: 'separated' },
    { count: 6, seatsPerTeam: 3, seating: 'random' },
  ] as const)('assigns a complete multihand roster deterministically: $count/$seatsPerTeam/$seating', ({ count, seatsPerTeam, seating }) => {
    const team = createTeamState({ mode: 'multihand', seatsPerTeam, seating, scoring: 'sum' }, count, 'team-seating-proof')
    const members = Array.from({ length: count / seatsPerTeam }, (_, index): TeamRoomMember => ({
      memberId: `member-${index}`, userId: `user-${index}`, name: `Name ${index}`, teamIndex: index, seatCount: seatsPerTeam,
    }))
    const bindings = planTeamSeating(team, members, 'team-seating-proof')
    expect(bindings.map(binding => binding.playerIndex)).toEqual(Array.from({ length: count }, (_, index) => index))
    expect(bindings.map(binding => binding.userId)).toEqual(team.playerTeams.map(index => `user-${index}`))
    expect(planTeamSeating(team, members, 'team-seating-proof')).toEqual(bindings)
  })

  it('rejects partial teams, mixed control and duplicate accounts before assigning any seats', () => {
    const team = createTeamState({ mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' }, 4, 17)
    const members = Array.from({ length: 4 }, (_, index): TeamRoomMember => ({
      memberId: `member-${index}`, userId: `user-${index}`, name: `Name ${index}`, teamIndex: Math.floor(index / 2), seatCount: 1,
    }))
    expect(() => planTeamSeating(team, members.slice(0, 3), 17)).toThrow('All team seats must be occupied')
    expect(() => planTeamSeating(team, members.map((member, index) => index === 0 ? { ...member, seatCount: 2 } : member), 17)).toThrow('Invalid team membership')
    expect(() => planTeamSeating(team, members.map(member => ({ ...member, userId: 'same-account' })), 17)).toThrow('Invalid team membership')
    expect(planTeamSeating(team, members, 17)).toEqual(planTeamSeating(team, members, 17))
  })
})
