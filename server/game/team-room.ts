import type { Broadcaster } from '../connection/broadcaster'
import { randomUUID } from 'node:crypto'
import type { TeamRoomMember, TeamWaitingRoomState } from '../../shared/contract/team-room'
import type { Room } from './room'
import type { TeamConfiguration, TeamState } from '../../shared/contract/team'
import type { GameSeed } from '../../shared/contract/types'
import { createSeededRng, shuffleWithRng } from '../../shared/utils/rng'

export function planTeamSeating(team: TeamState, members: readonly TeamRoomMember[], seed: GameSeed) {
  const { seatsPerTeam, mode } = team.configuration
  const teamCount = team.playerTeams.length / seatsPerTeam
  if (new Set(members.map(member => member.userId)).size !== members.length
    || new Set(members.map(member => member.memberId)).size !== members.length
    || members.some(member => !Number.isInteger(member.teamIndex) || member.teamIndex < 0 || member.teamIndex >= teamCount
      || member.seatCount !== (mode === 'multihand' ? seatsPerTeam : 1))) throw new Error('Invalid team membership')
  const rng = createSeededRng(seed, 'team-room-members', value => value + 0x51e7)
  return Array.from({ length: teamCount }, (_, teamIndex) => {
    const expanded = members.filter(member => member.teamIndex === teamIndex)
      .flatMap(member => Array.from({ length: member.seatCount }, () => member))
    if (expanded.length !== seatsPerTeam) throw new Error('All team seats must be occupied before starting')
    const shuffled = shuffleWithRng(expanded, rng)
    const positions = team.playerTeams.flatMap((value, index) => value === teamIndex ? [index] : [])
    return shuffled.map((member, index) => ({ ...member, playerIndex: positions[index]! }))
  }).flat().sort((left, right) => left.playerIndex - right.playerIndex)
}

export function admitTeamMember(room: Room, userId: string, name: string): TeamRoomMember {
  const team = room.session.state.team
  if (!team || room.status !== 'waiting') throw new Error('This room is not waiting for team members')
  const members = room.teamMembers ?? []
  const existing = members.find(member => member.userId === userId)
  if (existing) return { ...existing, name: name || existing.name }
  const { seatsPerTeam, mode } = team.configuration
  const seatCount = mode === 'multihand' ? seatsPerTeam : 1
  const teamIndex = Array.from({ length: room.maxPlayers / seatsPerTeam }, (_, index) => index)
    .find(index => members.filter(member => member.teamIndex === index).reduce((sum, member) => sum + member.seatCount, 0) + seatCount <= seatsPerTeam)
  if (teamIndex === undefined) throw new Error('room is full')
  return { memberId: randomUUID(), userId, name, teamIndex, seatCount }
}

export function projectTeamWaitingRoom(
  room: Pick<Room, 'id' | 'maxPlayers' | 'createdBy'> & { teamMembers?: readonly TeamRoomMember[] },
  configuration: TeamConfiguration,
  userId: string,
): TeamWaitingRoomState {
  const self = room.teamMembers?.find(member => member.userId === userId)
  if (!self) throw new Error('Only team members can view this waiting room')
  const isHost = room.createdBy === userId
  return {
    roomId: room.id, maxPlayers: room.maxPlayers, teamConfig: configuration,
    members: (room.teamMembers ?? []).map(({ userId: memberUserId, ...member }) => ({ ...member,
      isHost: memberUserId === room.createdBy,
    })),
    selfMemberId: self.memberId, isHost,
    canStart: isHost && (room.teamMembers ?? []).reduce((sum, member) => sum + member.seatCount, 0) === room.maxPlayers,
  }
}

export function teamWaitingState(room: Room, userId: string): TeamWaitingRoomState {
  const team = room.session.state.team
  if (!team) throw new Error('Only team members can view this waiting room')
  const waiting = projectTeamWaitingRoom(room, team.configuration, userId)
  return { ...waiting, members: waiting.members.map(member => ({ ...member,
    connected: room.waitingTeamConnections?.get(member.memberId)?.readyState === 1,
  })) }
}

export async function publishTeamWaitingRoom({ room, broadcaster }: { room: Room; broadcaster: Pick<Broadcaster, 'sendRoomEvent'> }): Promise<void> {
  for (const member of room.teamMembers ?? []) {
    const connection = room.waitingTeamConnections?.get(member.memberId)
    if (connection) await broadcaster.sendRoomEvent(connection, room, { type: 'teamRoomWaiting', ...teamWaitingState(room, member.userId) })
  }
}
