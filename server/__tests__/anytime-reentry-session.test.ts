import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

const SOWER = 'C115_Sower'
const SOWER_ANYTIME = 'C115-sower-anytime'
const TROWEL_ANYTIME = 'D13-trowel-anytime'
const WHISKY_ANYTIME = 'D106-whisky-distiller-anytime'

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  const state = session.getState().state
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  player.occupationPlayed = [SOWER]
  player.minorPlayed = ['D106_WhiskyDistiller']
  player.cardStates[SOWER] = { stack: ['reed', 'reed'] }
  player.resources.grain = 2
  player.resources.food = 0
  session.loadState(state)
  return session
}

const offered = (response: SessionResponse, id: string) =>
  response.interaction.anytimeActions.some((entry) => entry.id === id)

const request = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('expected waiting interaction')
  return response.interaction.request
}

const restore = (session: GameSession) => new GameSession(JSON.parse(JSON.stringify({
  state: session.getState().state,
  sessionCursor: session.createSessionPrivateCursor(),
})))

describe('anytime reentry', () => {
  it.each([false, true])('blocks the active entry and permits another anytime (host=%s)', (hasHost) => {
    const session = setup()
    const original = hasHost ? session.takeAction(0, 'farmland') : session.getState()
    const host = structuredClone(original.interaction)
    const started = session.takeAnytimeAction(0, SOWER_ANYTIME)
    expect(request(started).kind).toBe('choice')
    expect(offered(started, SOWER_ANYTIME)).toBe(false)
    expect(offered(started, WHISKY_ANYTIME)).toBe(true)
    const before = JSON.stringify(started.state)
    const interaction = structuredClone(started.interaction)
    const history = JSON.stringify(session.createSessionPrivateCursor())

    const rejected = session.takeAnytimeAction(0, SOWER_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(interaction)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(JSON.stringify(session.createSessionPrivateCursor())).toBe(history)

    const nested = session.takeAnytimeAction(0, WHISKY_ANYTIME)
    expect(nested.ok).toBe(true)
    expect(nested.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(nested.state.futureMeeples).toContainEqual(expect.objectContaining({ round: 3, resources: { food: 4 } }))
    expect(offered(nested, SOWER_ANYTIME)).toBe(false)
    expect(request(nested)).toEqual(request(started))
    const completed = session.resolveChoice(0, request(nested).options![0]!.value)
    expect(completed.ok).toBe(true)
    expect(completed.state.players[0]!.resources.reed).toBe(1)
    expect(completed.state.players[0]!.cardStates[SOWER]!.stack).toEqual(['reed'])
    expect(offered(completed, SOWER_ANYTIME)).toBe(true)
    expect(completed.interaction.stateId).toBe(host.stateId)
    if (host.stateId === 'wait') expect(request(completed)).toEqual(host.request)
  })

  it('keeps the entry blocked through a later optional choice and restore, then unlocks on skip and undo', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    const host = structuredClone(request(session.takeAction(0, 'farmland')))
    const started = session.takeAnytimeAction(0, SOWER_ANYTIME)
    const sow = session.resolveChoice(0, request(started).options![1]!.value)
    expect(request(sow).options).toContainEqual(expect.objectContaining({ value: '__skip__' }))
    expect(sow.state.players[0]!.cardStates[SOWER]!.stack).toEqual(['reed'])
    expect(offered(sow, SOWER_ANYTIME)).toBe(false)

    const restored = restore(session)
    expect(restored.getState().interaction).toEqual(sow.interaction)
    expect(restored.takeAnytimeAction(0, SOWER_ANYTIME).ok).toBe(false)
    const completed = restored.resolveChoice(0, '__skip__')
    expect(request(completed)).toEqual(host)
    expect(offered(completed, SOWER_ANYTIME)).toBe(true)
    expect(offered(restored.undoStep(), SOWER_ANYTIME)).toBe(false)
    expect(offered(restored.undoStep(), SOWER_ANYTIME)).toBe(false)
    const undone = restored.undoStep()
    expect(request(undone)).toEqual(host)
    expect(offered(undone, SOWER_ANYTIME)).toBe(true)
    expect(undone.state.players[0]!.cardStates[SOWER]!.stack).toEqual(['reed', 'reed'])
  })

  it.each([false, true])('rejects repeated Trowel before renovation and grants Hammer Crusher only once (host=%s)', (hasHost) => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['D013_Trowel', 'D014_HammerCrusher']
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0 }
    session.loadState(state)
    if (hasHost) session.takeAction(0, 'farmland')
    const started = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(started.ok).toBe(true)
    expect(started.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 2, resources: { clay: 2, reed: 1, stone: 0 },
    })
    expect(offered(started, TROWEL_ANYTIME)).toBe(false)
    expect(request(started).kind).toBe('engine-blocked')
    const before = JSON.stringify(started.state)
    const rejected = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    const undone = session.undoStep()
    expect(undone.ok).toBe(true)
    expect(offered(undone, TROWEL_ANYTIME)).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('keeps an interrupted ancestor blocked while another anytime is waiting', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorPlayed.push('D013_Trowel', 'D014_HammerCrusher')
    session.loadState(state)
    const trowel = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(request(trowel).options).toContainEqual(expect.objectContaining({ value: 'continue' }))
    const nested = session.takeAnytimeAction(0, SOWER_ANYTIME)
    expect(offered(nested, SOWER_ANYTIME)).toBe(false)
    expect(offered(nested, TROWEL_ANYTIME)).toBe(false)
    const restored = restore(session)
    expect(restored.takeAnytimeAction(0, TROWEL_ANYTIME).ok).toBe(false)
    const completed = restored.resolveChoice(0, request(nested).options![0]!.value)
    expect(request(completed)).toEqual(request(trowel))
    expect(offered(completed, TROWEL_ANYTIME)).toBe(false)
    expect(offered(completed, SOWER_ANYTIME)).toBe(true)
  })

  it('keeps the lock through after listeners without blocking another entry on the same card', () => {
    const session = setup()
    const cardId = '__TEST_anytime_after__'
    session.state.players[0]!.minorPlayed.push(cardId)
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('anytime reentry test')
      for (const resource of ['food', 'clay']) registry.registerListener({
        id: `${cardId}-${resource}`,
        cardIds: [cardId],
        phases: ['anytime'],
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { [resource]: 1 } } }),
      })
      registry.registerListener({
        id: `${cardId}-after`,
        cardIds: [cardId],
        phases: ['after'],
        actions: ['gain'],
        handler: (context) => context.sourceCard === cardId && context.params?.food === 1
          ? { flow: { type: 'leaf', actionId: 'plow', sourceCard: cardId } }
          : undefined,
      })
    })
    const started = session.takeAnytimeAction(0, `${cardId}-food`)
    expect(request(started).kind).toBe('farm-select')
    expect(started.state.players[0]!.resources.food).toBe(1)
    expect(offered(started, `${cardId}-food`)).toBe(false)
    expect(offered(started, `${cardId}-clay`)).toBe(true)
    expect(session.takeAnytimeAction(0, `${cardId}-food`).ok).toBe(false)
    const nested = session.takeAnytimeAction(0, `${cardId}-clay`)
    expect(nested.state.players[0]!.resources).toMatchObject({ food: 1, clay: 1 })
    expect(offered(nested, `${cardId}-food`)).toBe(false)
    const completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(completed.ok).toBe(true)
    expect(offered(completed, `${cardId}-food`)).toBe(true)
    expect(completed.state.players[0]!.fields).toHaveLength(1)
  })

  it('keeps the entry blocked while an animal reorganization frame suspends its completed gain', () => {
    const session = setup()
    const cardId = '__TEST_anytime_animals__'
    session.state.players[0]!.minorPlayed.push(cardId)
    session.withCtx(() => requireActiveCardRegistry('anytime reentry test').registerListener({
      id: cardId,
      cardIds: [cardId],
      phases: ['anytime'],
      handler: () => ({ flow: { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { sheep: 2 } } }),
    }))
    const started = session.takeAnytimeAction(0, cardId)
    expect(request(started).kind).toBe('animal-reorg')
    expect(offered(started, cardId)).toBe(false)
    expect(offered(started, SOWER_ANYTIME)).toBe(true)
    expect(session.takeAnytimeAction(0, cardId).ok).toBe(false)
    expect(session.getState().state.players[0]!.resources.sheep).toBe(2)
    const nested = session.takeAnytimeAction(0, SOWER_ANYTIME)
    expect(offered(nested, cardId)).toBe(false)
    expect(offered(nested, SOWER_ANYTIME)).toBe(false)
    const resumed = session.resolveChoice(0, request(nested).options![0]!.value)
    expect(request(resumed).kind).toBe('animal-reorg')
    expect(offered(resumed, cardId)).toBe(false)
    const completed = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }],
    })
    expect(completed.ok).toBe(true)
    expect(completed.state.players[0]!.resources.sheep).toBe(1)
    expect(offered(completed, cardId)).toBe(true)
  })

  it('retains the initiating player restriction during a foreign optional choice', () => {
    const session = setup()
    const cardId = '__TEST_anytime_foreign_plow__'
    for (const player of session.state.players) player.minorPlayed.push(cardId)
    session.withCtx(() => requireActiveCardRegistry('anytime reentry test').registerListener({
      id: cardId,
      cardIds: [cardId],
      phases: ['anytime'],
      handler: (context) => ({ flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { food: 1 } },
          {
            type: 'leaf', actionId: 'plow', sourceCard: cardId, optional: true,
            targetPlayerId: context.state.players.find((player) => player.id !== context.player.id)!.id,
          },
        ],
      } }),
    }))
    expect(request(session.takeAnytimeAction(0, cardId))).toMatchObject({ kind: 'confirm-player-switch', toPlayerIndex: 1 })
    const opponent = session.resolveChoice(0, 'confirm')
    expect(request(opponent).options).toContainEqual(expect.objectContaining({ value: '__skip__' }))
    expect(offered(opponent, cardId)).toBe(false)
    expect(session.getEngineStack().getActiveAnytimeActionIds(session.state.players[0]!.id)).toContain(cardId)
    expect(session.getEngineStack().getActiveAnytimeActionIds(session.state.players[1]!.id)).not.toContain(cardId)
    expect(session.takeAnytimeAction(0, cardId).ok).toBe(false)
    const skipped = session.resolveChoice(1, '__skip__')
    expect(request(skipped)).toMatchObject({ kind: 'confirm-player-switch', toPlayerIndex: 0 })
    const returned = session.resolveChoice(1, 'confirm')
    expect(returned.ok).toBe(true)
    expect(offered(returned, cardId)).toBe(true)
    expect(returned.state.players.every((player) => player.fields.length === 0)).toBe(true)
  })
})
