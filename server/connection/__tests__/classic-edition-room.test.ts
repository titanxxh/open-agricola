import { describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import type { ClientCommand } from '../../../shared/contract/protocol/ws'
import { withClassicCardDefinitions } from '../../../shared/cards/classic-catalog'
import { classicFixtureCards } from '../../../shared/cards/__tests__/__fixtures__/classic-definitions'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { snapshotToRoom } from '../../game/room'
import { buildGameResult } from '../../game/room-persistence-checkpoint'

// ADR 0049: room creation admits the classic option only through the injectable switch, and rejects classic games
// combined with Farmers of the Moor, the community deck, Parent Cards, Through the Seasons or solo.
const { newDeps, dispatch } = recordedRouterFixture()

const createActor = (classicEditionEnabled: boolean, userId = 'host', deps = newDeps()) => {
  const socket = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  const ctx = createConnectionCtx(socket as unknown as WebSocket, { ...deps, classicEditionEnabled }, true, userId)
  return { ctx, socket, deps }
}

type Actor = ReturnType<typeof createActor>
const messagesOf = ({ socket }: Actor): Array<Record<string, any>> =>
  socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
const lastOutcome = (actor: Actor) =>
  messagesOf(actor).findLast(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome

// Only two classic cards are ported; accepted classic rooms size their pool with test-only definitions. CE and CI hold
// 18 occupations and 18 minors at two players, enough for two 7-card hands of each type; CZ is never chosen.
const FIXTURES = [
  ...classicFixtureCards('CE', 'occupation', 10),
  ...classicFixtureCards('CE', 'minor', 10),
  ...classicFixtureCards('CI', 'occupation', 8),
  ...classicFixtureCards('CI', 'minor', 8),
  ...classicFixtureCards('CZ', 'occupation', 8),
  ...classicFixtureCards('CZ', 'minor', 8),
]
const CE_CI = new Set(FIXTURES.filter(card => card.deck === 'CE' || card.deck === 'CI').map(card => card.id))
const withFixtures = (run: () => Promise<void>) => withClassicCardDefinitions(FIXTURES, run)

const markRoomStarted = async ({ ctx }: Actor) => {
  ctx.currentRoom!.status = 'playing'
  ctx.currentRoom!.startedAt ??= 1
  expect((await ctx.committer!.prepareRoom(ctx.currentRoom!, { missingPrefix: false })).kind).toBe('committed')
}

type CreateRoom = Extract<ClientCommand, { type: 'createRoom' }>
const classicRoom = (extra: Partial<CreateRoom> = {}): CreateRoom =>
  ({ type: 'createRoom', maxPlayers: 2, name: 'Host', cardEdition: 'classic', classicDeckIds: ['CE', 'CI'], ...extra })

describe('classic room admission', () => {
  it('rejects a classic room while the switch is off and still creates a revised one', async () => {
    const actor = createActor(false)
    await dispatch(actor.ctx, classicRoom())
    expect(actor.ctx.currentRoom).toBeNull()
    expect(lastOutcome(actor)).toMatchObject({ ok: false, code: 'classic_edition_disabled' })

    await dispatch(actor.ctx, { type: 'createRoom', maxPlayers: 2, name: 'Host', cardEdition: 'revised' })
    expect(actor.ctx.currentRoom!.session.state.cardEdition).toBeUndefined()
    expect(await actor.deps.lobby.getRooms()).toEqual([expect.not.objectContaining({ cardEdition: expect.anything() })])
    expect(lastOutcome(actor)).toMatchObject({ ok: true })
  })

  it.each([
    ['Farmers of the Moor', { enableFarmersOfTheMoor: true }],
    ['the community deck', { enableCommunityDeck: true }],
    ['Parent Cards', { enableParentCards: true }],
    ['Through the Seasons', { enableThroughTheSeasons: true }],
    ['solo', { maxPlayers: 1 }],
    ['completed solo setup reuse', { sourceGameContextId: 'solo-source' }],
  ] as const)('rejects a classic room combined with %s while the switch is on', async (_name, extra) => {
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom(extra))
    expect(actor.ctx.currentRoom).toBeNull()
    expect(lastOutcome(actor)).toMatchObject({ ok: false, code: 'classic_edition_incompatible' })
    expect(messagesOf(actor).some(message => message.type === 'roomCreated' || message.type === 'stateUpdate')).toBe(false)
  })

  it('rejects a classic room whose eligible pool cannot fill every hand of maxPlayers', () => withFixtures(async () => {
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom({ maxPlayers: 3, hotseat: true }))
    expect(actor.ctx.currentRoom).toBeNull()
    expect(lastOutcome(actor)).toMatchObject({
      ok: false, code: 'classic_pool_insufficient',
      shortfall: { playerCount: 3, needed: { occupation: 21, minor: 21 }, eligible: { occupation: 18, minor: 18 } },
    })
  }))

  it('accepts a classic room with the snake opening and deals only its chosen decks', () => withFixtures(async () => {
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom({ enableSnakeOpening: true, classicDeckIds: [' ci', 'CE', 'CQ'] }))
    const room = actor.ctx.currentRoom!
    expect(lastOutcome(actor)).toMatchObject({ ok: true, roomId: room.id })
    expect(room.session.state).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'], enableSnakeOpening: true })
    expect(room).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
    expect(await actor.deps.lobby.getRooms()).toEqual([expect.objectContaining({ id: room.id, cardEdition: 'classic' })])
    for (const player of room.session.state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect([...player.occupationHand, ...player.minorHand].every(id => CE_CI.has(id))).toBe(true)
    }
  }))

  it('checks the eligible pool against the draft packets of every seat', () => withFixtures(async () => {
    // 18 eligible cards per type fill two 7-card hands but not two 10-card draft packets.
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom({ draftMode: 'simultaneous', draftPoolSize: 10 }))
    expect(actor.ctx.currentRoom).toBeNull()
    expect(lastOutcome(actor)).toMatchObject({ ok: false, code: 'classic_pool_insufficient' })
  }))
})

describe('classic rematch', () => {
  it('starts the rematch with the same edition and Classic Decks', () => withFixtures(async () => {
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom({ hotseat: true, classicDeckIds: ['CI', 'CE'] }))
    const previousRoomId = actor.ctx.currentRoom!.id
    await markRoomStarted(actor)

    await dispatch(actor.ctx, { type: 'newGame' })

    const room = actor.ctx.currentRoom!
    expect(room.id).not.toBe(previousRoomId)
    expect(room).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
    expect(room.session.state).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
    expect(room.session.state.players.flatMap(player => [...player.occupationHand, ...player.minorHand])
      .every(id => CE_CI.has(id))).toBe(true)
  }))

  it('rejects a classic rematch once the switch is off but keeps the classic game playable', () => withFixtures(async () => {
    const actor = createActor(true)
    await dispatch(actor.ctx, classicRoom({ hotseat: true }))
    const room = actor.ctx.currentRoom!
    const roomId = room.id
    await markRoomStarted(actor)
    actor.ctx.classicEditionEnabled = false

    await dispatch(actor.ctx, { type: 'newGame', requestId: 'rematch' })
    expect(lastOutcome(actor)).toMatchObject({ ok: false, code: 'classic_edition_disabled' })
    await dispatch(actor.ctx, { type: 'proposeGameEnd', intent: 'rematch' })
    expect(lastOutcome(actor)).toMatchObject({ ok: false, code: 'classic_edition_disabled' })
    expect(room.endProposal ?? null).toBeNull()
    expect(actor.ctx.currentRoom!.id).toBe(roomId)

    const wood = room.session.state.players[room.session.state.currentPlayerIndex]!.resources.wood
    const actingIndex = room.session.state.currentPlayerIndex
    await dispatch(actor.ctx, { type: 'action', spaceId: 'forest' })
    expect(lastOutcome(actor)).toMatchObject({ ok: true })
    expect(room.session.state.players[actingIndex]!.resources.wood).toBeGreaterThan(wood)
    expect(room.session.state.cardEdition).toBe('classic')
  }))
})

describe('existing classic games', () => {
  it('restores a classic room after restart and resumes its seats while the switch is off', () => withFixtures(async () => {
    const host = createActor(true, 'host')
    await dispatch(host.ctx, classicRoom())
    const guest = createActor(true, 'guest', host.deps)
    const roomId = host.ctx.currentRoom!.id
    await dispatch(guest.ctx, { type: 'joinRoom', roomId, name: 'Guest' })
    expect(host.ctx.currentRoom!.status).toBe('playing')
    const hands = host.ctx.currentRoom!.session.state.players.map(player => player.occupationHand)

    const saved = (await host.deps.persistence.load(roomId))!
    expect(saved.meta).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CE', 'CI'] })
    const restarted = newDeps(host.deps.persistence)
    const restored = snapshotToRoom(saved)
    expect(restored).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CE', 'CI'] })
    expect(buildGameResult(restored, Date.now())).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CE', 'CI'] })
    restarted.registry.set(restored)
    const resumed = createActor(false, 'host', restarted)
    await dispatch(resumed.ctx, { type: 'joinRoom', roomId, intent: 'resume', name: 'Host' })

    expect(resumed.ctx.currentRoom).toBe(restored)
    expect(messagesOf(resumed)).toContainEqual(expect.objectContaining({ type: 'roomJoined', roomId, status: 'playing' }))
    expect(restored.session.state).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CE', 'CI'] })
    expect(restored.session.state.players.map(player => player.occupationHand)).toEqual(hands)
  }))
})
