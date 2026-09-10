import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D013_Trowel'
import '../../shared/cards/D/D014_HammerCrusher'
import '../../shared/cards/D/D154_ChimneySweep'
import '../../shared/cards/E/E014_WoodSaw'
import '../../shared/cards/C/C115_Sower'

const TROWEL = 'D013_Trowel'
const TROWEL_ANYTIME = 'D13-trowel-anytime'

const setup = (options: {
  houseType?: PlayerState['houseType']
  resources?: Partial<PlayerState['resources']>
  playerCount?: number
} = {}) => {
  const session = new GameSession(6013, undefined, { playerCount: options.playerCount ?? 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.round = 14
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  for (const space of state.actionSpaces) space.takenBy = []
  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    for (const key of Object.keys(player.resources) as Array<keyof PlayerState['resources']>) {
      player.resources[key] = 0
    }
  }
  state.players[0]!.minorPlayed = [TROWEL]
  state.players[0]!.houseType = options.houseType ?? 'wood'
  Object.assign(state.players[0]!.resources, options.resources)
  session.loadState(state)
  return session
}

const offered = (response: SessionResponse, id = TROWEL_ANYTIME) =>
  response.interaction.anytimeActions.some((entry) => entry.id === id)

const request = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('expected waiting interaction')
  return response.interaction.request
}

describe('anytime current-step admission', () => {
  it.each([
    ['wood', { stone: 1, reed: 2, food: 2 }],
    ['wood', { stone: 2, reed: 1, food: 2 }],
    ['wood', { stone: 2, reed: 2, food: 1 }],
    ['clay', { stone: 1, reed: 0, food: 0 }],
  ] as const)('rejects an unaffordable %s renovation with %j without losing plow or undo history', (houseType, resources) => {
    const session = setup({ houseType, resources })
    const before = session.takeAction(0, 'farmland')
    expect(request(before).kind).toBe('farm-select')
    const snapshot = JSON.stringify(before.state)
    const interaction = structuredClone(before.interaction)

    expect(offered(before)).toBe(false)
    expect(session.getState().interaction).toEqual(interaction)
    const rejected = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(interaction)
    expect(JSON.stringify(rejected.state)).toBe(snapshot)

    const plowed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(plowed.ok, plowed.error).toBe(true)
    expect(plowed.state.players[0]!.fields).toHaveLength(1)
    expect(session.undoStep().interaction).toEqual(interaction)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toEqual([])
  })

  it.each([
    ['wood', { stone: 2, reed: 2, food: 2 }],
    ['clay', { stone: 2, reed: 0, food: 0 }],
  ] as const)('pays the %s cost and resumes the original plow request', (houseType, resources) => {
    const session = setup({ houseType, resources })
    const expected = structuredClone(request(session.takeAction(0, 'farmland')))
    const result = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(request(result)).toEqual(expected)
    expect(result.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0, food: 0 },
    })
    expect(result.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.paid', paymentFor: 'renovation' }),
      expect.objectContaining({ type: 'farm.renovated', sourceCardId: TROWEL }),
    ]))
    const plowed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(plowed.ok, plowed.error).toBe(true)
    expect(plowed.state.players[0]!.fields).toHaveLength(1)
  })

  it.each(['absent', 'stone'] as const)('rejects Trowel when %s and preserves the host', (condition) => {
    const session = setup({ houseType: condition === 'stone' ? 'stone' : 'wood' })
    if (condition === 'absent') {
      const state = session.getState().state
      state.players[0]!.minorPlayed = []
      session.loadState(state)
    }
    const before = session.takeAction(0, 'farmland')
    expect(offered(before)).toBe(false)
    const interaction = structuredClone(before.interaction)
    const rejected = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(interaction)
  })

  it('preserves the original player handoff after rejection', () => {
    const session = setup()
    const before = session.takeAction(0, 'forest')
    expect(request(before)).toMatchObject({ kind: 'confirm-next-player', nextPlayerIndex: 1 })
    const interaction = structuredClone(before.interaction)
    const rejected = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(interaction)
    const confirmed = session.resolveChoice(0, 'confirm')
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.currentPlayerIndex).toBe(1)
  })

  it('uses the actual renovation discount when deciding availability', () => {
    const session = setup({ houseType: 'clay', playerCount: 4 })
    const state = session.getState().state
    state.players[0]!.occupationPlayed = ['D154_ChimneySweep']
    session.loadState(state)
    const before = session.takeAction(0, 'farmland')
    const expected = structuredClone(request(before))
    expect(offered(before)).toBe(true)
    const result = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(request(result)).toEqual(expected)
    expect(result.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0 } })
  })

  it.each([false, true])('uses Hammer Crusher reed to pay for Trowel wood-to-stone renovation (host=%s)', (hasHost) => {
    const session = setup({ resources: { clay: 2, stone: 2, reed: 1, food: 2 } })
    const state = session.getState().state
    state.players[0]!.minorPlayed.push('D014_HammerCrusher')
    session.loadState(state)
    const before = hasHost ? session.takeAction(0, 'farmland') : session.getState()
    const original = hasHost ? structuredClone(request(before)) : null
    const snapshot = JSON.stringify(before.state)
    expect(offered(before)).toBe(true)
    expect(JSON.stringify(session.getState().state)).toBe(snapshot)

    const renovated = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(renovated.ok, renovated.error).toBe(true)
    expect(renovated.state.players[0]).toMatchObject({
      houseType: 'stone', rooms: 2, resources: { clay: 4, stone: 0, reed: 0, food: 0 },
    })
    expect(renovated.state.events.filter((event) => event.type === 'farm.renovated')).toEqual([
      expect.objectContaining({ from: 'wood', to: 'stone', sourceCardId: TROWEL }),
    ])
    expect(offered(renovated)).toBe(false)
    if (hasHost) {
      expect(request(renovated)).toEqual(original)
      const plowed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
      expect(plowed.ok, plowed.error).toBe(true)
      expect(plowed.state.players[0]!.fields).toHaveLength(1)
    } else {
      expect(renovated.interaction.stateId).toBe('idle')
      expect(renovated.state.currentPlayerIndex).toBe(0)
    }
  })

  it('allows a legal before effect without promising completion of renovation', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    state.players[0]!.minorPlayed.push('D014_HammerCrusher')
    session.loadState(state)
    const before = session.takeAction(0, 'farmland')
    const original = structuredClone(before.interaction)
    expect(offered(before)).toBe(true)
    const started = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(request(started).options).toContainEqual(expect.objectContaining({ value: 'continue' }))
    expect(started.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 2, reed: 1, stone: 0 },
    })
    const continued = session.resolveChoice(0, 'continue')
    expect(continued.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, stone: 0 })
    expect(request(continued).kind).toBe('engine-blocked')
    expect(session.undoStep().ok).toBe(true)
    const undone = session.undoStep()
    expect(undone.interaction).toEqual(original)
    expect(undone.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, stone: 0 })
  })

  it('rebuilds availability after another anytime gains a missing resource without mutating queries', () => {
    const session = setup({ resources: { stone: 2, reed: 1, food: 2 } })
    const state = session.getState().state
    state.players[0]!.occupationPlayed = ['C115_Sower']
    state.players[0]!.cardStates.C115_Sower = { stack: ['reed'] }
    session.loadState(state)
    const before = session.takeAction(0, 'farmland')
    const snapshot = JSON.stringify(before.state)
    expect(offered(before)).toBe(false)
    for (let index = 0; index < 3; index++) {
      expect(offered(session.getState())).toBe(false)
      expect(JSON.stringify(session.getState().state)).toBe(snapshot)
    }
    const choice = session.takeAnytimeAction(0, 'C115-sower-anytime')
    const takeReed = request(choice).options![0]!
    const result = session.resolveChoice(0, takeReed.value)
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.reed).toBe(2)
    expect(offered(result)).toBe(true)
    expect(request(result).kind).toBe('farm-select')
    expect(session.takeAnytimeAction(0, TROWEL_ANYTIME).state.players[0]!.houseType).toBe('stone')
  })

  it('allows Sower to gain then pay reed while retaining its optional sow', () => {
    const session = setup({ resources: { grain: 1 } })
    const state = session.getState().state
    state.players[0]!.minorPlayed = []
    state.players[0]!.occupationPlayed = ['C115_Sower']
    state.players[0]!.cardStates.C115_Sower = { stack: ['reed'] }
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)
    const original = structuredClone(request(session.takeAction(0, 'farmland')))
    const choice = session.takeAnytimeAction(0, 'C115-sower-anytime')
    const exchange = request(choice).options![1]!
    const result = session.resolveChoice(0, exchange.value)
    expect(request(result).options).toContainEqual(expect.objectContaining({ value: '__skip__' }))
    expect(result.state.players[0]!.resources.reed).toBe(0)
    expect(result.state.players[0]!.cardStates.C115_Sower!.stack).toEqual([])
    const skipped = session.resolveChoice(0, '__skip__')
    expect(request(skipped)).toEqual(original)
    expect(skipped.state.players[0]!.resources.grain).toBe(1)
  })

  it.each([false, true])('checks an optional anytime root before showing it (affordable=%s)', (affordable) => {
    const session = setup({ resources: affordable ? { wood: 5, reed: 2 } : {} })
    const state = session.getState().state
    state.players[0]!.minorPlayed = ['E014_WoodSaw']
    setActiveWorkerCount(state.players[1]!, 3)
    session.loadState(state)
    const before = session.takeAction(0, 'farmland')
    const original = structuredClone(before.interaction)
    expect(offered(before, 'E14-wood-saw-anytime')).toBe(affordable)
    const result = session.takeAnytimeAction(0, 'E14-wood-saw-anytime')
    expect(result.ok).toBe(affordable)
    if (affordable) {
      expect(request(result).options).toContainEqual(expect.objectContaining({ value: '__skip__' }))
      expect(session.resolveChoice(0, '__skip__').interaction).toEqual(original)
    } else {
      expect(result.interaction).toEqual(original)
    }
  })

  it.each([false, true])('uses current admission in harvest and pre-scoring windows (affordable=%s)', (affordable) => {
    const session = setup({ houseType: 'clay', resources: { stone: affordable ? 2 : 0 } })
    const state = session.getState().state
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    }
    session.loadState(state)
    let result = session.performRoundEnd()
    if (affordable) {
      expect(request(result).options).toContainEqual(expect.objectContaining({ value: '__skip__' }))
      expect(offered(result)).toBe(true)
      result = session.resolveChoice(0, '__skip__')
      const renovation = request(result).options!.find((option) => option.sourceCard === TROWEL)!
      expect(renovation).toBeDefined()
      result = session.resolveChoice(0, renovation.value)
      expect(result.state.players[0]!.houseType).toBe('stone')
      expect(result.state.players[0]!.resources.stone).toBe(0)
    } else {
      expect(offered(result)).toBe(false)
      expect(result.state.players[0]!.houseType).toBe('clay')
    }
    expect(result.state.gameOver).toBe(true)
    expect(result.scores).toHaveLength(2)
  })

  it.each([false, true])('blocks an accepted mandatory continuation and restores through undo (host=%s)', (hasHost) => {
    const session = setup({ resources: { food: 1 } })
    const state = session.getState().state
    const player = state.players[0]!
    const cardId = '__TEST_anytime_pay_then_plow__'
    player.minorPlayed = [cardId]
    player.fields = Array.from({ length: 15 }, (_, index) => ({
      row: Math.floor(index / 5), col: index % 5, stacks: [],
    })).filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
    session.loadState(state)
    session.withCtx(() => requireActiveCardRegistry('anytime admission test').registerListener({
      id: cardId,
      cardIds: [cardId],
      phases: ['anytime'],
      handler: () => ({
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } },
            { type: 'leaf', actionId: 'plow' },
          ],
        },
      }),
    }))
    const before = hasHost ? session.takeAction(0, 'forest') : session.getState()
    const original = structuredClone(before.interaction)
    expect(offered(before, cardId)).toBe(true)
    const result = session.takeAnytimeAction(0, cardId)
    expect(request(result).kind).toBe('engine-blocked')
    expect(result.state.players[0]!.resources.food).toBe(0)
    expect(result.state.currentPlayerIndex).toBe(0)
    const restored = session.undoStep()
    expect(restored.interaction).toEqual(original)
    expect(restored.state.players[0]!.resources.food).toBe(1)
    const blocked = session.takeAnytimeAction(0, cardId)
    expect(request(blocked).kind).toBe('engine-blocked')
    if (!hasHost) {
      expect(blocked.interaction.allowedCommands).not.toContain('undoAction')
      const undone = session.undoStep()
      expect(undone.interaction).toEqual(original)
      expect(undone.state.players[0]!.resources.food).toBe(1)
      return
    }
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    expect(undone.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
  })
})
