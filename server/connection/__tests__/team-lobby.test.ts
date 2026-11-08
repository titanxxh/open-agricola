import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { randomUUID } from 'node:crypto'
import { RoomDirectory } from '../../game/room-directory'

const { newDeps, dispatch } = recordedRouterFixture()
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as never, deps, true, userId,
)

describe('team waiting room', () => {
  it('lets a player choose a team before the room is full', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    const alice = client(deps, 'alice')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Host',
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
    })
    const room = host.currentRoom!
    await dispatch(alice, { type: 'joinRoom', roomId: room.id, name: 'Alice' })
    expect(room.teamMembers!.find(member => member.userId === 'alice')!.teamIndex).toBe(0)
    await dispatch(alice, { type: 'setTeam', teamIndex: 1 })
    expect(room.teamMembers!.find(member => member.userId === 'alice')!.teamIndex).toBe(1)
    expect((await deps.persistence.load(room.id))!.meta.teamMembers!.find(member => member.userId === 'alice')!.teamIndex).toBe(1)
    expect(room.players).toEqual([])
    expect(room.status).toBe('waiting')
  })

  it('enforces self and host permissions, team capacity and the final started seat mapping', async () => {
    const deps = newDeps()
    const [host, alice, bob, carol] = ['host', 'alice', 'bob', 'carol'].map(userId => client(deps, userId))
    await dispatch(host!, { type: 'createRoom', maxPlayers: 4, name: 'Host',
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
    })
    const room = host!.currentRoom!
    await dispatch(alice!, { type: 'joinRoom', roomId: room.id, name: 'Alice' })
    await dispatch(alice!, { type: 'setTeam', teamIndex: 1 })
    await dispatch(bob!, { type: 'joinRoom', roomId: room.id, name: 'Bob' })
    const bobId = room.teamMembers!.find(member => member.userId === 'bob')!.memberId
    await dispatch(host!, { type: 'setTeam', memberId: bobId, teamIndex: 1 })
    expect(room.teamMembers!.find(member => member.userId === 'bob')!.teamIndex).toBe(1)
    const hostId = room.teamMembers!.find(member => member.userId === 'host')!.memberId
    await dispatch(alice!, { type: 'setTeam', memberId: hostId, teamIndex: 1 })
    expect(room.teamMembers!.find(member => member.userId === 'host')!.teamIndex).toBe(0)
    await dispatch(carol!, { type: 'joinRoom', roomId: room.id, name: 'Carol' })
    expect(room.status).toBe('waiting')
    await dispatch(host!, { type: 'setTeam', teamIndex: 1 })
    expect(room.teamMembers!.find(member => member.userId === 'host')!.teamIndex).toBe(0)
    await dispatch(host!, { type: 'startTeamGame' })
    expect(room.status).toBe('playing')
    expect(room.seatOwners!.filter(owner => room.session.state.team!.playerTeams[owner.playerIndex] === 0).map(owner => owner.userId).sort()).toEqual(['carol', 'host'])
    expect(room.seatOwners!.filter(owner => room.session.state.team!.playerTeams[owner.playerIndex] === 1).map(owner => owner.userId).sort()).toEqual(['alice', 'bob'])
  })

  it('restores the previous roster and publishes no membership change when saving fails', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    const alice = client(deps, 'alice')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    await dispatch(alice, { type: 'joinRoom', roomId: room.id })
    const before = structuredClone(room.teamMembers)
    vi.mocked(host.ws.send).mockClear()
    vi.spyOn(deps.checkpoint, 'recordMeta').mockRejectedValueOnce(new Error('Save unavailable'))
    await dispatch(alice, { type: 'setTeam', teamIndex: 1 })
    expect(room.teamMembers).toEqual(before)
    expect((await deps.persistence.load(room.id))!.meta.teamMembers).toEqual(before)
    expect(host.ws.send).not.toHaveBeenCalled()
    expect(vi.mocked(alice.ws.send).mock.calls.some(([raw]) => String(raw).includes('team_change_failed'))).toBe(true)
    await dispatch(alice, { type: 'setTeam', teamIndex: 1 })
    expect(room.teamMembers!.find(member => member.userId === 'alice')!.teamIndex).toBe(1)
  })

  it('replays a completed team-change receipt with the current unseated team summary', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    const alice = client(deps, 'alice')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    await dispatch(alice, { type: 'joinRoom', roomId: room.id })
    const scope = await deps.commands.issueScope('user:alice')
    const command = { type: 'setTeam', teamIndex: 1, commandContext: { scopeId: scope.scopeId, commandId: randomUUID(), roomId: room.id, expectedVersion: room.version } } as const
    await dispatch(alice, command)
    const memberId = room.teamMembers!.find(member => member.userId === 'alice')!.memberId
    await dispatch(host, { type: 'setTeam', memberId, teamIndex: 0 })
    vi.mocked(alice.ws.send).mockClear()
    await dispatch(alice, command)
    expect(room.teamMembers!.find(member => member.userId === 'alice')!.teamIndex).toBe(0)
    const events = vi.mocked(alice.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))
    expect(events.some(event => event.type === 'teamRoomWaiting' && event.members.some((member: { memberId: string; teamIndex: number }) => member.memberId === memberId && member.teamIndex === 0))).toBe(true)
    expect(events.some(event => event.type === 'roomWaiting')).toBe(false)
  })

  it('shows safe account names for unnamed members and exposes the team configuration in lobby discovery', async () => {
    const deps = newDeps()
    const host = client(deps, 'private-account-id')
    await dispatch(host, { type: 'getCommandScope' })
    await deps.commands.db.prepare('UPDATE users SET display_name=? WHERE id=?').run('Visible Host', 'private-account-id')
    vi.mocked(host.ws.send).mockClear()
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'product', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    expect(room.teamMembers![0]!.name).toBe('Visible Host')
    expect(vi.mocked(host.ws.send).mock.calls.every(([raw]) => !String(raw).includes('private-account-id'))).toBe(true)
    const directory = new RoomDirectory(deps.commands.db)
    await directory.register('team-lobby', 'http://team-lobby:9000', 'team-lobby')
    await directory.activate('team-lobby')
    const owner = (await directory.claim(room.id, 'team-lobby')).owner
    await deps.commands.db.transaction(async () => { await directory.markActive(room.id, owner); await directory.presence(room.id, owner, 1, 1) })()
    expect(await directory.lobby()).toMatchObject([{ id: room.id, teamConfig: {
      mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'product', teammateVisibility: 'private',
    } }])
  })
})
