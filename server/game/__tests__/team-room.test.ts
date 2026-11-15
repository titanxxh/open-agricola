import { describe, expect, it } from 'vitest'
import { createTeamState } from '../../../shared/domain/team-scoring'
import type { TeamRoomMember } from '../../../shared/contract/team-room'
import { planTeamReassignment, planTeamSeating } from '../team-room'

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

describe('waiting Team reassignment', () => {
  it.each([{ count: 4, seatsPerTeam: 2 }, { count: 6, seatsPerTeam: 2 }, { count: 6, seatsPerTeam: 3 }] as const)(
    'exchanges the specified accounts without changing $count/$seatsPerTeam capacity or seating ownership', ({ count, seatsPerTeam }) => {
      const team = createTeamState({ mode: 'team', seatsPerTeam, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' }, count, 17)
      const members = Array.from({ length: count }, (_, index): TeamRoomMember => ({ memberId: `m${index}`, userId: `u${index}`,
        name: `Farmer ${index}`, teamIndex: Math.floor(index / seatsPerTeam), seatCount: 1 }))
      const next = planTeamReassignment(team, members, { kind: 'swap', memberId: 'm0', teamIndex: 1, swapMemberId: `m${seatsPerTeam}` })
      expect(next?.map(member => member.teamIndex)).toEqual(members.map((member, index) => index === 0 ? 1 : index === seatsPerTeam ? 0 : member.teamIndex))
      expect(next?.map(member => member.userId)).toEqual(members.map(member => member.userId))
      expect(members[0]?.teamIndex).toBe(0)
      const bindings = planTeamSeating(team, next ?? [], 17)
      expect(bindings.filter(binding => binding.userId === 'u0').every(binding => team.playerTeams[binding.playerIndex] === 1)).toBe(true)
      expect(planTeamReassignment(team, members, { kind: 'move', memberId: 'm0', teamIndex: 1 })).toBeUndefined()
      expect(planTeamReassignment(team, members.slice(0, seatsPerTeam + 1), { kind: 'move', memberId: 'm0', teamIndex: 1 }))
        .toEqual(members.slice(0, seatsPerTeam + 1).map((member, index) => index === 0 ? { ...member, teamIndex: 1 } : member))
      for (const corrupt of [
        members.map(member => ({ ...member, userId: 'duplicate' })),
        members.map(member => ({ ...member, memberId: 'm0' })),
        members.map((member, index) => index === 1 ? { ...member, seatCount: 2 } : member),
        members.map((member, index) => index === 1 ? { ...member, teamIndex: -1 } : member),
      ]) expect(planTeamReassignment(team, corrupt, { kind: 'swap', memberId: 'm0', teamIndex: 1, swapMemberId: `m${seatsPerTeam}` })).toBeUndefined()
    })
})
