import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { removePlayerFromRoom, snapshotToRoom } from '../../game/room'
import { ReplayStore } from '../../game/replay-store'

const { newDeps, dispatch } = recordedRouterFixture()
const client = (deps: ReturnType<typeof newDeps>, userId: string) => {
  const ws = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  return Object.assign(createConnectionCtx(ws as never, deps, true), { currentUserId: userId })
}
const table = async (count = 2) => {
  const deps = newDeps()
  const clients = Array.from({ length: count }, (_, index) => client(deps, `player-${index}`))
  await dispatch(clients[0]!, { type: 'createRoom', maxPlayers: count, name: 'Host' })
  const room = clients[0]!.currentRoom!
  for (const player of clients.slice(1)) await dispatch(player, { type: 'joinRoom', roomId: room.id })
  expect(room.status).toBe('playing')
  return { deps, clients, room, db: deps.commands.db }
}

describe('game end agreement', () => {
  it('lets another player propose, recovers consent and archives only after every original player agrees', async () => {
    const { deps, clients: [host, guest], room, db } = await table()
    const id = room.id
    await dispatch(guest!, { type: 'proposeGameEnd', intent: 'end' })
    const proposal = room.endProposal!
    expect(proposal.proposerIndex).toBe(guest!.currentPlayerIndex)
    expect(proposal.agreements).toHaveLength(1)
    expect(await deps.gameContextStore.lifecycle(id)).toBe('active')
    const snapshot = (await deps.persistence.load(id))!
    const recovered = snapshotToRoom(snapshot)
    expect(recovered.endProposal).toEqual(proposal)
    recovered.session.dispose()
    await dispatch(host!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    expect(await deps.persistence.load(id)).toBeNull()
    expect(await deps.gameContextStore.resolve(id)).toMatchObject({ ok: true, lifecycle: 'terminated', termination: { reason: 'agreement', players: expect.arrayContaining([
      expect.objectContaining({ playerIndex: host!.currentPlayerIndex }), expect.objectContaining({ playerIndex: guest!.currentPlayerIndex }),
    ]) } })
    expect(await db.prepare('SELECT * FROM game_results WHERE room_id=?').get(id)).toBeUndefined()
    expect(await db.prepare('SELECT * FROM game_termination_players WHERE room_id=?').all(id)).toHaveLength(2)
    expect(await new ReplayStore(db).manifest(id)).toMatchObject({ ok: true, participants: expect.any(Array) })
    expect(room.session.state.gameOver).toBe(false)
  })

  it('cancels on rejection or withdrawal and rejects answers to an old proposal', async () => {
    const { clients: [host, guest], room } = await table()
    await dispatch(host!, { type: 'proposeGameEnd', intent: 'end' })
    const oldId = room.endProposal!.id
    await dispatch(guest!, { type: 'respondGameEnd', proposalId: oldId, agree: false })
    expect(room.endProposal).toBeNull()
    await dispatch(host!, { type: 'proposeGameEnd', intent: 'end' })
    const id = room.endProposal!.id
    await dispatch(guest!, { type: 'respondGameEnd', proposalId: oldId, agree: true })
    expect(room.endProposal!.id).toBe(id)
    await dispatch(guest!, { type: 'withdrawGameEnd', proposalId: id })
    expect(room.endProposal!.id).toBe(id)
    await dispatch(host!, { type: 'withdrawGameEnd', proposalId: id })
    expect(room.endProposal).toBeNull()
    expect(room.status).toBe('playing')
  })

  it('rolls back the terminal transition when archiving fails and allows an explicit retry', async () => {
    const { deps, clients: [host, guest], room, db } = await table()
    await dispatch(host!, { type: 'proposeGameEnd', intent: 'end' })
    const id = room.endProposal!.id
    await db.exec("CREATE FUNCTION reject_termination() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive unavailable'; END $$; CREATE TRIGGER reject_termination BEFORE INSERT ON game_terminations FOR EACH ROW EXECUTE FUNCTION reject_termination()")
    await dispatch(guest!, { type: 'respondGameEnd', proposalId: id, agree: true })
    expect(await deps.gameContextStore.lifecycle(room.id)).toBe('active')
    expect(room.endProposal!.agreements).toHaveLength(1)
    expect((await deps.persistence.loadReplayHead(room.id))!.status).toBe('recording')
    expect(guest!.ws.close).not.toHaveBeenCalled()
    await db.exec('DROP TRIGGER reject_termination ON game_terminations')
    await dispatch(guest!, { type: 'respondGameEnd', proposalId: id, agree: true })
    expect(await deps.gameContextStore.lifecycle(room.id)).toBe('terminated')
  })

  it.each([{ maxPlayers: 1, soloHandMode: 'choose-7' as const }, { maxPlayers: 3, hotseat: true }])('ends a solo or hotseat game after one confirmation: %j', async options => {
    const deps = newDeps()
    const host = client(deps, 'host')
    await dispatch(host, { type: 'createRoom', ...options })
    const room = host.currentRoom!
    expect(room.status).toBe('playing')
    await dispatch(host, { type: 'proposeGameEnd', intent: 'end' })
    expect(await deps.gameContextStore.resolve(room.id)).toMatchObject({ lifecycle: 'terminated', termination: {
      reason: options.maxPlayers === 1 ? 'solo_confirmation' : 'hotseat_confirmation',
    } })
  })

  it('preserves choose-seven setup when a solo player ends and rematches', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    await dispatch(host, { type: 'createRoom', maxPlayers: 1, soloHandMode: 'choose-7' })
    const oldId = host.currentRoom!.id
    await dispatch(host, { type: 'proposeGameEnd', intent: 'rematch' })
    expect(host.currentRoom!.id).not.toBe(oldId)
    expect(host.currentRoom!.session.state.phase).toBe('solo-hand-selection')
    expect(host.currentRoom!.soloHandMode).toBe('choose-7')
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
  })

  it('keeps an offline consenting player in a new waiting room and refuses a stranger their reserved seat', async () => {
    const { deps, clients: [host, second, third], room } = await table(3)
    const oldId = room.id
    const owners = structuredClone(room.seatOwners)
    await dispatch(host!, { type: 'proposeGameEnd', intent: 'rematch' })
    const proposal = room.endProposal!
    await dispatch(second!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    removePlayerFromRoom(room, second!.ws)
    await dispatch(third!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    expect(room.id).not.toBe(oldId)
    expect(room.status).toBe('waiting')
    expect(room.seatOwners?.map(owner => owner.userId).sort()).toEqual(owners?.map(owner => owner.userId).sort())
    expect((await deps.persistence.load(room.id))!.meta.players).toEqual(room.seatOwners)
    const stranger = client(deps, 'stranger')
    await dispatch(stranger, { type: 'joinRoom', roomId: room.id })
    expect(stranger.currentRoom).toBeNull()
    const resumed = client(deps, second!.currentUserId!)
    await dispatch(resumed, { type: 'joinRoom', roomId: room.id })
    expect(resumed.currentPlayerIndex).toBe(room.seatOwners!.find(owner => owner.userId === second!.currentUserId)!.playerIndex)
    expect(room.status).toBe('playing')
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
  })

  it('blocks direct dissolution of a started room through the shared lobby service', async () => {
    const { deps, clients: [host], room } = await table()
    expect(await deps.lobby.dissolveRoomById(room.id, host!.currentUserId)).toMatchObject({ ok: false, error: 'started games require an end proposal' })
    await dispatch(host!, { type: 'dissolveRoom' })
    expect(await deps.gameContextStore.lifecycle(room.id)).toBe('active')
  })
})
