import type { TeamConfiguration } from './team'

export type TeamRoomMember = {
  memberId: string
  userId: string
  name: string
  teamIndex: number
  seatCount: number
}

export type TeamWaitingRoomState = {
  roomId: string
  maxPlayers: number
  teamConfig: TeamConfiguration
  members: Array<Omit<TeamRoomMember, 'userId'> & { connected?: boolean; isHost: boolean }>
  selfMemberId: string
  isHost: boolean
  canStart: boolean
}

export function parseTeamRoomMembers(value: unknown): TeamRoomMember[] | undefined {
  if (value === null || value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('Invalid stored team members')
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object'
      || !('memberId' in entry) || typeof entry.memberId !== 'string' || !entry.memberId
      || !('userId' in entry) || typeof entry.userId !== 'string' || !entry.userId
      || !('name' in entry) || typeof entry.name !== 'string'
      || !('teamIndex' in entry) || typeof entry.teamIndex !== 'number' || !Number.isInteger(entry.teamIndex) || entry.teamIndex < 0
      || !('seatCount' in entry) || typeof entry.seatCount !== 'number' || !Number.isInteger(entry.seatCount) || entry.seatCount < 1 || entry.seatCount > 3) {
      throw new Error('Invalid stored team member')
    }
    return { memberId: entry.memberId, userId: entry.userId, name: entry.name, teamIndex: entry.teamIndex, seatCount: entry.seatCount }
  })
}
